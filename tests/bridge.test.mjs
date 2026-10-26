import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from '../examples/support/fixture.js';
import { personOperation } from '../src/person-service.js';
import { createPersonMemoryBridge, parseMemoryRequest } from '../src/bridge/person-memory.js';
import { personMemoryConfig } from '../src/bridge/config.js';

function setup(t,extra={}) {
 const f=fixture();t.after(()=>f.cleanup());
 const sends=[];let revision=1;
 const cfg={ownerQQ:'100',personMemory:personMemoryConfig({personMemory:{enabled:true,friendlyReplies:true}})};
 const b=createPersonMemoryBridge({
  root:f.root,api:{},getConfig:()=>cfg,getRole:()=> 'assistant',
  ensureSession:async key=>key==='group:1'?'group-now':'private-now',
  isAllowed:key=>['private:100','group:1'].includes(key),
  transport:async()=>({status:'ready',entryId:'entry-demo',revision,text:'喜欢气泡水'}),
  send:async(key,text,guard)=>{await guard?.();sends.push({key,text});return {messageId:'receipt-'+sends.length};},
  ...extra
 });
 return {...f,b,sends,cfg,change:()=>revision++,ledger:()=>Object.values(JSON.parse(fs.readFileSync(path.join(f.root,'state/person-memory-requests.json'),'utf8')))};
}
const msg=(id,text='/记忆 查询 饮品偏好',actor='100')=>({kind:'group',id:'1',event:{self_id:'demo-bot',user_id:actor,message_id:id},plainContent:text});

test('config projection preserves explicit enabled; defaults to off',()=>{
 assert.deepEqual(personMemoryConfig({}),{enabled:false,friendlyReplies:false});
 assert.equal(personMemoryConfig({personMemory:{enabled:'true'}}).enabled,false);
 assert.equal(personMemoryConfig({personMemory:{enabled:true}}).enabled,true);
});
test('config flag actually controls request handler',async t=>{
 const x=setup(t);x.cfg.personMemory.enabled=false;
 assert.equal(await x.b.handle(msg('a')),false);assert.equal(x.sends.length,0);
 x.cfg.personMemory.enabled=true;assert.equal(await x.b.handle(msg('b')),true);assert.equal(x.sends.length,1);
});
test('normal query routes to requester DM and duplicate event sends once',async t=>{
 const x=setup(t),m=msg('a','你还记得我喜欢喝什么吗，私聊发我');
 await x.b.handle(m);await x.b.handle(m);
 assert.equal(x.sends.length,1);assert.equal(x.sends[0].key,'private:100');assert.equal(x.ledger()[0].state,'sent');
});
test('other actor never reads personal service',async t=>{
 let calls=0;const x=setup(t,{transport:async()=>{calls++;throw Error('unexpected');}});
 await x.b.handle(msg('a','/记忆 查询 饮品偏好','200'));
 assert.equal(calls,0);assert(!x.sends.some(s=>s.text.includes('气泡水')));
});
test('revision change immediately before send blocks remembered fact',async t=>{
 let revision=0;const x=setup(t,{transport:async()=>({status:'ready',entryId:'entry-demo',revision:++revision,text:'不可发送的旧值'})});
 await x.b.handle(msg('a'));assert(!x.sends.some(s=>s.text.includes('不可发送的旧值')));assert.equal(x.ledger()[0].state,'failed');
});
test('entry deletion before send blocks remembered fact',async t=>{
 let calls=0;const x=setup(t,{transport:async()=>++calls===1?{status:'ready',entryId:'entry-demo',revision:1,text:'不可发送的旧值'}:{status:'not-found'}});
 await x.b.handle(msg('a'));assert(!x.sends.some(s=>s.text.includes('不可发送的旧值')));
});
test('cancellation while request waits prevents value send',async t=>{
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const x=setup(t,{transport:async()=>{entered();await gate;return {status:'ready',entryId:'entry-demo',revision:1,text:'不可发送的旧值'};}});
 const task=x.b.handle(msg('a'));await started;await x.b.handle(msg('b','别发了'));release();await task;
 assert(!x.sends.some(s=>s.text.includes('不可发送的旧值')));assert.equal(x.ledger()[0].state,'revoked');
});
test('ambiguous send recorded unknown and not retried on replay',async t=>{
 let attempts=0;const x=setup(t,{send:async(_k,_t,guard)=>{await guard?.();attempts++;throw Error('synthetic timeout');}});
 const m=msg('a');await x.b.handle(m);await x.b.handle(m);
 assert.equal(attempts,1);assert.equal(x.ledger()[0].state,'unknown');
});
test('destination revoked inside send queue prevents transmission',async t=>{
 let allowed=true,transmissions=0;
 const x=setup(t,{isAllowed:()=>allowed,send:async(_k,_t,guard)=>{if(!allowed)throw Error('destination revoked');allowed=false;await guard?.();transmissions++;}});
 await x.b.handle(msg('a'));
 // The host send adapter enforces its whitelist for every path, including errors.
 assert.equal(x.ledger()[0].state,'failed');
 assert.equal(transmissions,0);
});
test('secret-looking service value is blocked even when status says ready',async t=>{
 const x=setup(t,{transport:async()=>({status:'ready',entryId:'entry-demo',revision:1,text:'暗号=DEMO-NONSECRET-PHRASE'})});
 await x.b.handle(msg('a'));assert(!x.sends.some(s=>s.text.includes('DEMO-NONSECRET-PHRASE')));
});
test('parser leaves ordinary chat and explicit negative disclosure alone',()=>{
 assert.equal(parseMemoryRequest('今天好热'),null);
 assert.equal(parseMemoryRequest('不要告诉大家我喜欢喝什么'),null);
 assert.equal(parseMemoryRequest('@测试助手 /记忆 查询 饮品偏好').topic,'饮品偏好');
 assert.equal(parseMemoryRequest('记住我喜欢喝柠檬水').action,'save');
 assert.equal(parseMemoryRequest('/记忆 保存 暗号=DEMO-NONSECRET-PHRASE').topic,'暗号');
});
test('bridge save/group recall/correct/forget uses a single synthetic store',async t=>{
 const x=setup(t);let id=0;
 const b=createPersonMemoryBridge({root:x.root,api:{},getConfig:()=>x.cfg,getRole:()=> 'assistant',
 ensureSession:async key=>key==='group:1'?'group-now':'private-now',isAllowed:()=>true,
 transport:async input=>personOperation(x.policy,x.store,x.vectors,input),
 send:async(key,text,guard)=>{await guard?.();x.sends.push({key,text});return {messageId:'receipt'};}});
 const send=async(kind,text)=>b.handle({...msg(String(++id),text),kind,id:kind==='private'?'100':'1'});
 await send('private','/记忆 保存 饮品偏好=喜欢气泡水');
 await send('group','/记忆 查询 饮品偏好');assert(x.sends.at(-1).text.includes('气泡水'));
 await send('private','/记忆 更正 饮品偏好=只在周末喝柠檬水');
 await send('group','/记忆 查询 饮品偏好');assert(x.sends.at(-1).text.includes('只在周末'));
 await send('private','/记忆 忘记 饮品偏好');
 await send('group','/记忆 查询 饮品偏好');assert(!x.sends.at(-1).text.includes('柠檬水'));
});

