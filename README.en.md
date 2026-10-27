# DSH Person Memory

**One person, recognized across sessions, private chats, and a configured group.**
Memory follows the person; the situation only decides what may be used and what may be said.

[中文](README.md) · [Integration guide](docs/INTEGRATION.md) · [Limitations](docs/LIMITATIONS.md) · [Validation](docs/VALIDATION.md)

---

## What this is

A **runnable reference implementation** extracted from a real DSH memory project. It ships the core modules, an offline synthetic demo, 28 regression tests, and an integration contract.

It solves *person identity*: bind a **platform account + persona** to one stable person, so private chat, desktop sessions, and a configured group share the same person record — while separating "who is this", "may I use it", and "may I say it". No layer relies on prompt obedience.

**What it is not** (important):

- Not a DSH plugin, not an npm package; **`npm install` will not work, and copying files into a plugin directory does nothing**;
- No installer, service lifecycle, data migration, or real QQ sending script;
- Not multi-tenant, not an encrypted vault, not a fully transactional messaging system.

If you want a plug-and-play plugin, this repository is not it. If you already run DSH and a chat bridge and want a concrete "person memory" design to adapt, it is.

## What it changes in practice

| Situation | Without person memory | With this module |
| --- | --- | --- |
| New session / window | Starts over, meets you again | Same person record, continues |
| Remembered in private, asked in group | Group cannot read it, or dumps the whole private chat | Owner asks, gets only that item; others get nothing |
| Correction | Old and new values mix | Revision and conditions are kept; old value does not return |
| "Forget it" | Old chat or summary brings it back | Deletion ledger + derived invalidation |
| Impersonation in a group | Cannot tell who is speaking | Actor comes from a trusted platform event, not text |
| Subagent / same directory | Inherits all private memory | No automatic inheritance; explicit binding only |

## Run it in 30 seconds (no install)

Node.js >= 22.13, no runtime dependencies:

```sh
git clone https://github.com/N1ght-Awe/dsh-person-memory.git
cd dsh-person-memory
node --version        # v22.13 or newer
npm run demo
npm test
npm run check
```

Expected demo output (synthetic data, no service contacted):

```json
{"destination":"private:100","text":"嗯，记住了。"}
{"destination":"group:1","text":"你喜欢气泡水，记着呢。"}
...
Demo passed. Synthetic data only; no server or platform messages.
```

`npm test` runs 28 synthetic regressions. `npm run check` verifies per-file SHA-256 against the release manifest and scans for credentials, local paths, runtime files, and live identifiers.

## Integrating with your DSH (not file copying)

> Full field and interface contract: [docs/INTEGRATION.md](docs/INTEGRATION.md) (Chinese). The outline below is a route map with a checkpoint per step.

**Prerequisites**: DSH 0.2.1.x; Node >= 22.13; current path rules assume Windows (adapt for POSIX); an existing MemoryStore you can reuse; optionally an existing QQ bridge.

**Step 1 — identity policy (Gate 0a).** Write a policy that states who the person is and which sessions/workspaces/groups belong to them: `ownerId`, `personaId`, `personalCwd`, `bridgeRoot`, `bridgeSessionsPath`, `roleStatePath`, `desktopSessions`, `groups`, `features.normalGroupDisclosure`, `legacyPrivateSessionIds`. Account and persona come from explicit configuration, never from model text; the session map is host-maintained; directories must be absolute and unique.

**Step 2 — reuse host storage (single writer).** Wire `personOperation(policy, store, vectors, input)` to the existing store. Required adapter surface: `bucketOf`, `entryOf`, `add`, `update`, `remove`, `vectors.drop`, `vectors.flush`. Writes must persist `revision` and `source.ownerId/personaId/sessionId/origin`; every content-changing entry point must bump the revision. `examples/support/store.js` is a demo adapter — never use it for real data.

**Step 3 — expose the person endpoint (Gate 0b).** The bridge POSTs to `/api/session-memory/person` with `{ input: { actor, key, sessionId, requestId, messageId, action, topic } }`. `actor/key/messageId` must come from verified platform events, never model arguments. The endpoint must require host + bridge authentication and must not be exposed as an LLM tool. Default auth reads `DSH_HOME/session-memory/bridge-person.key`.

**Step 4 — filter every model-visible path.** The endpoint alone is not enough. Apply the same filter to tools, prompt injection, `Memory.md` export, summary queue, embedding queue, search results, and panel-to-model paths: `entries.filter(modelReadable)`. Secret bodies must not appear in any model-visible path.

**Step 5 — bridge wiring.** Consume person requests before the model queue: `if (await personMemory.handle(...)) return;`. Send only to a fixed destination and re-check before sending; if `beforeSend` throws, do not send; on an unknown platform result keep `unknown`, do not blindly retry; the request ledger is writable only by trusted processes.

**Step 6 — verify and roll back.** Verify on an isolated host: config reaches the handler, session rotation, stranger rejection, no subagent binding, group vs private destination, correction/deletion revisions, cancellation, unknown-result retry, and every secret model path. Roll back by disabling the feature and keeping new data; do not restore a full old database or re-enable "same directory means personal access".

## Architecture

```text
trusted platform event (actor / messageId / chat)
        │
        ▼
QQ bridge adapter ──► personOperation (Gate 0b)
        │                    │
        │                    ├─ IdentityMemory (Gate 0a)
        │                    ├─ person-policy (normal / secret)
        │                    └─ host MemoryStore (single writer)
        ▼
memoryReply / fixed-destination send
```

| Module | File | Responsibility |
| --- | --- | --- |
| IdentityMemory | `src/identity-memory.js` | person resolution, readable scope, prompt construction |
| personOperation | `src/person-service.js` | save / correct / query / forget, revision and scope |
| person-policy | `src/person-policy.js` | normal / secret classification, topic matching, model visibility |
| person-memory bridge | `src/bridge/person-memory.js` | request parsing, ledger, fixed destination, pre-send checks |
| memoryReply | `src/bridge/memory-reply.js` | short replies preserving negation, conditions, history |

## Repository layout

```text
src/            core modules
examples/       runnable demo and demo-only storage adapter
tests/          28 synthetic regressions
docs/           integration, limitations, privacy, validation
scripts/        release-manifest checker
RELEASE-MANIFEST.json   per-file SHA-256
```

## Validation and limits

Verified here: core modules, demo, and synthetic tests (28 pass; networking is disabled by the test preloader). **Not verified**: real host authentication, production MemoryStore, real platform delivery, long-context compaction, crash recovery, or concurrent writers. See [docs/VALIDATION.md](docs/VALIDATION.md).

Read [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before adapting. The main ones:

- one bound user + one configured group; no multi-tenant, auto-registration, or binding UI;
- Windows path rules; POSIX needs adaptation;
- normal / secret is a limited rule classifier, not a privacy detector;
- secrets are not encrypted and are not returned in groups;
- pre-send recheck narrows the stale-value window but is not an atomic storage-to-platform transaction;
- old chats, backups, and vectors are not erased automatically; forgetting one entry is not a full-chain erase.

## License and provenance

MIT. Based on a local extension of [dsh-workspace-recollection](https://github.com/reaxlll/dsh-workspace-recollection) and an existing QQ bridge; notices and licenses are in [NOTICE](NOTICE.md) and `LICENSES/`. This repository does not redistribute DSH, QQ clients, gateways, models, or third-party SDKs.

Please report issues and contribute adapters with **synthetic data only**; never attach chat logs, real accounts, memory stores, backups, or credentials.
