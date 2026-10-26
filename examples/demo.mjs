import assert from 'node:assert/strict';
import { fixture } from './support/fixture.js';
import { personOperation } from '../src/person-service.js';
import { createPersonMemoryBridge } from '../src/bridge/person-memory.js';
import { personMemoryConfig } from '../src/bridge/config.js';

const f = fixture();
try {
  const cfg = { ownerQQ: '100', personMemory: personMemoryConfig({ personMemory: { enabled: true, friendlyReplies: true } }) };
  const sent = [];
  const bridge = createPersonMemoryBridge({
    root: f.root, api: {}, getConfig: () => cfg, getRole: () => 'assistant',
    ensureSession: async key => f.policy.read(f.config.bridgeSessionsPath).sessions[key],
    isAllowed: key => ['private:100', 'group:1'].includes(key),
    transport: async input => personOperation(f.policy, f.store, f.vectors, input),
    send: async (destination, text, guard) => {
      await guard?.();
      sent.push({ destination, text });
      console.log(JSON.stringify({ destination, text }));
      return { messageId: 'synthetic-receipt-' + sent.length };
    },
  });
  let id = 0;
  const message = (kind, text) => bridge.handle({
    kind, id: kind === 'private' ? '100' : '1',
    event: { user_id: '100', self_id: 'demo-bot', message_id: String(++id) }, plainContent: text,
  });
  await message('private', '/记忆 保存 饮品偏好=喜欢气泡水');
  f.write(f.config.bridgeSessionsPath, { sessions: { 'private:100': 'private-next', 'group:1': 'group-now' } });
  await message('group', '/记忆 查询 饮品偏好');
  assert(sent.at(-1).text.includes('气泡水'));
  await message('private', '/记忆 更正 饮品偏好=不喜欢气泡水，周末偶尔喝柠檬水');
  await message('group', '你还记得我喜欢喝什么吗，私聊发我');
  assert.equal(sent.at(-1).destination, 'private:100');
  assert(sent.at(-1).text.includes('不喜欢'));
  await message('private', '/记忆 忘记 饮品偏好');
  await message('group', '/记忆 查询 饮品偏好');
  assert(!sent.at(-1).text.includes('气泡水'));
  console.log('Demo passed. Synthetic data only; no server or platform messages.');
} finally { f.cleanup(); }

