import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../examples/support/fixture.js';
import { personOperation } from '../src/person-service.js';
import { modelReadable } from '../src/person-policy.js';
import { renderIdentityPrompt } from '../src/identity-memory.js';
const using = (t) => { const f = fixture(); t.after(() => f.cleanup()); return f; };
test('current private session binds; retired session and cwd alone cannot', t => {
 const f=using(t), c=f.config;
 assert.equal(f.policy.resolve(c.bridgeRoot,'private-now').kind,'private');
 assert.throws(()=>f.policy.resolve(c.bridgeRoot,'private-old'));
 assert.equal(f.policy.resolve(c.desktopWorkspaces[0],'desktop-demo').kind,'private');
 assert.equal(f.policy.resolve(c.desktopWorkspaces[0],'child-demo').kind,'workspace');
 assert.throws(()=>f.policy.resolve(c.personalCwd,'private-now'));
});
test('group session binds only group scope',t=>{
 const f=using(t), g=f.config.groups[0];
 assert.equal(f.policy.resolve(g.cwd,'group-now').kind,'group');
 assert.throws(()=>f.policy.resolve(g.cwd,'forged'));
});
test('saved data survives reload and private session rotation; group sees same person',t=>{
 const f=using(t);f.op('save','饮品偏好','喜欢气泡水');
 f.write(f.config.bridgeSessionsPath,{sessions:{'private:100':'private-next','group:1':'group-now'}});
 assert.equal(f.policy.resolve(f.config.bridgeRoot,'private-next').kind,'private');
 assert.throws(()=>f.op('recall','饮品偏好'));
 const r=personOperation(f.policy,f.reload(),f.vectors,{actor:'100',key:'group:1',sessionId:'group-now',requestId:'request-demo',messageId:'message-demo',action:'recall',topic:'饮品偏好'});
 assert.equal(r.text,'喜欢气泡水');assert.equal(r.personId,'qq:100');
});
test('correction increments revision, invalidates vectors, forget survives reload',t=>{
 const f=using(t),a=f.op('save','饮品偏好','喜欢气泡水');
 f.op('correct','饮品偏好','只在周末喝柠檬水');const b=f.op('recall','饮品偏好');
 assert.equal(b.text,'只在周末喝柠檬水');assert.equal(b.revision,a.revision+1);
 assert(f.vectors.dropped.includes(a.entryId));
 f.op('forget','饮品偏好');assert.equal(f.reload().bucketOf(f.config.personalCwd).entries.length,0);
});
test('secret does not appear in response or authorized model view',t=>{
 const f=using(t),phrase='DEMO-NONSECRET-PHRASE',r=f.op('save','暗号',phrase);
 assert(!JSON.stringify(r).includes(phrase));
 const context=f.policy.resolve(f.config.bridgeRoot,'private-now');
 assert.equal(f.policy.view(f.store,f.vectors,context).origins.size,0);
 assert.equal(f.op('recall','暗号').status,'restricted');
 const entry=f.reload().bucketOf(f.config.personalCwd).entries[0];
 assert.equal(entry.sensitivity,'secret');assert.equal(modelReadable(entry),false);
});
test('group cannot write, another actor cannot read, disabling disclosure rejects group',t=>{
 const f=using(t),extra={key:'group:1',sessionId:'group-now'};
 assert.throws(()=>f.op('save','topic','value',extra));
 assert.throws(()=>f.op('recall','topic',null,{actor:'200'}));
 f.write(f.policyFile,{...f.config,features:{normalGroupDisclosure:false}});
 assert.throws(()=>f.op('recall','topic',null,extra));
});
test('persona change rejects service and private identity',t=>{
 const f=using(t);f.write(f.config.roleStatePath,{role:'different-assistant'});
 assert.throws(()=>f.op('recall','topic'));
 assert.throws(()=>f.policy.resolve(f.config.bridgeRoot,'private-now'));
});
test('group prompt recognizes bound identity without injecting private fact',t=>{
 const f=using(t);f.op('save','饮品偏好','仅测试用的气泡水偏好');
 const c=f.policy.resolve(f.config.groups[0].cwd,'group-now');
 const text=renderIdentityPrompt(f.policy.view(f.store,f.vectors,c),c);
 assert(text.includes('100'));assert(!text.includes('仅测试用的气泡水偏好'));
});
test('credential-shaped input rejected; ambiguity does not dump records',t=>{
 const f=using(t);
 assert.throws(()=>f.op('save','环境','API key: DEMO-NOT-A-CREDENTIAL'));
 f.op('save','早餐饮品','气泡水');f.op('save','晚间饮品','柠檬水');
 const r=f.op('recall','喝什么');assert.equal(r.status,'ambiguous');assert(!JSON.stringify(r).includes('柠檬水'));
});
test('invalid policy and uncorrelated requests fail closed',t=>{
 const f=using(t);assert.throws(()=>f.op('save','x','y',{messageId:''}));
 f.write(f.policyFile,{...f.config,personalCwd:f.config.bridgeRoot});
 assert.throws(()=>f.policy.policy());
});
test('locked deletion is not reported successful',t=>{
 const f=using(t),r=f.op('save','饮品偏好','喜欢气泡水');
 f.store.entryOf(f.config.personalCwd,r.entryId).locked=true;
 assert.throws(()=>f.op('forget','饮品偏好'));
 assert.equal(f.op('recall','饮品偏好').text,'喜欢气泡水');
});

