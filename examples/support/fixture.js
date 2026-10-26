import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityMemory } from '../../src/identity-memory.js';
import { personOperation } from '../../src/person-service.js';
import { DemoStore, DemoVectors } from './store.js';

export function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-person-memory-demo-'));
  const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
  // Deliberately synthetic, non-live account identifiers and logical Windows paths.
  const config = {
    version: 2, ownerId: '100', personaId: 'assistant',
    personalCwd: 'C:/example/person', bridgeRoot: 'C:/example/bridge',
    desktopWorkspaces: ['C:/example/desktop'],
    desktopSessions: [{ sessionId: 'desktop-demo', cwd: 'C:/example/desktop', personId: 'qq:100', personaId: 'assistant' }],
    bridgeSessionsPath: path.join(root, 'sessions.fixture.json'),
    roleStatePath: path.join(root, 'role.fixture.json'),
    groups: [{ key: 'group:1', cwd: 'C:/example/bridge/group1' }],
    features: { normalGroupDisclosure: true },
    legacyPrivateSessionIds: ['private-old'],
  };
  const policyFile = path.join(root, 'policy.fixture.json');
  const storeFile = path.join(root, 'store.fixture.json');
  write(policyFile, config);
  write(config.roleStatePath, { role: 'assistant' });
  write(config.bridgeSessionsPath, { sessions: { 'private:100': 'private-now', 'group:1': 'group-now' } });
  const policy = new IdentityMemory(policyFile);
  const store = new DemoStore(storeFile);
  const vectors = new DemoVectors();
  let serial = 0;
  return {
    root, config, policyFile, storeFile, policy, store, vectors, write,
    reload: () => new DemoStore(storeFile),
    op: (action, topic, text, extra = {}) => personOperation(policy, store, vectors, {
      actor: '100', key: 'private:100', sessionId: 'private-now',
      requestId: 'request-' + (++serial), messageId: 'message-' + serial, action, topic, text, ...extra,
    }),
    cleanup: () => {
      const resolved = path.resolve(root);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
          !path.basename(resolved).startsWith('dsh-person-memory-demo-')) throw Error('Invalid cleanup target');
      fs.rmSync(resolved, { recursive: true, force: true });
    },
  };
}

