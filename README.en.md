# DSH Person Memory

[中文](README.md)

A small reference implementation for person-scoped memory across DSH sessions and private/group chat contexts. It separates identity resolution, disclosure policy, storage operations, and conversational presentation.

This is an integration reference, **not a complete DSH plugin or a drop-in installation**. It contains extracted core modules, a standalone synthetic demo, tests, and a host integration guide. There are no runtime dependencies.

## Run

Node.js 22.13+:

~~~sh
npm run demo
npm test
npm run check
~~~

No install is required. The demo saves a synthetic preference, rotates a session, queries it in a synthetic group, corrects it, routes a requested answer to the requester, and forgets it. Its send adapter only prints synthetic results. The test preloader disables networking. The harness creates and removes its own temporary directory.

## Design

- Gate 0a: bind trusted platform identity to a current session and persona. A working directory alone does not grant personal access.
- Gate 0b: process a concrete platform request, retain a fixed destination, recheck revisions immediately before sending, and avoid retrying an ambiguous send.
- Ordinary memories can be requested by their owner in an allowed group. Secret entries are excluded from automatic value returns.
- Storage remains behind the host's existing single writer. The bundled DemoStore is only a test adapter.
- Deterministic presentation preserves negation and conditions; recognized old dossier formats prompt verification instead of dumping the record.

Identity path rules currently assume Windows. Classification and intent parsing use limited rules. This is not a multi-tenant security boundary, encrypted secret vault, full transactional messaging system, or arbitrary natural-language authorization interpreter.

Read [integration](docs/INTEGRATION.md), [limitations](docs/LIMITATIONS.md), [privacy](docs/PRIVACY.md), and [validation](docs/VALIDATION.md) before adapting it. The current detailed integration guide is in Chinese.

MIT; upstream notices are retained under LICENSES. See [NOTICE](NOTICE.md). No real accounts, conversations, private character cards, credentials, database snapshots, or production configuration are part of the release.

