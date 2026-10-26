import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryReply } from '../src/bridge/memory-reply.js';
const reply=text=>memoryReply({status:'ready',text},{friendly:true,action:'recall'});
test('brief preference answer is generic and configurable',()=>{
 assert.equal(reply('喜欢气泡水'),'你喜欢气泡水，记着呢。');
 assert.equal(memoryReply({status:'ready',text:'喜欢气泡水'}),'你喜欢气泡水。');
});
test('negation, conditions and historical changes survive',()=>{
 assert.equal(reply('我不喜欢汽水，但周末偶尔喝'),'你不喜欢汽水，但周末偶尔喝。');
 assert.equal(reply('以前喜欢咖啡，现在喜欢水'),'以前喜欢咖啡，现在喜欢水。');
 assert.equal(reply('我喜欢果汁，但晚上只喝水'),'你喜欢果汁，但晚上只喝水。');
});
test('synthetic old dossier is not turned into a current fact',()=>{
 const old='用户（demo-account）在 2030-01-01 私聊里发来一条记忆保存指令：某个历史值。';
 const out=reply(old);assert(out.includes('先核对'));assert(!out.includes('demo-account'));assert(!out.includes('历史值'));
});
test('confirmations reflect save, correction, deletion and secret status',()=>{
 assert.equal(memoryReply({status:'saved'},{friendly:true}),'嗯，记住了。');
 assert.equal(memoryReply({status:'updated'}),'改好了，以这次说的为准。');
 assert.equal(memoryReply({status:'forgotten'}),'这条记忆删掉了。');
 assert(memoryReply({status:'saved',text:'已保存为私密条目'}).includes('不会在聊天里自动说出来'));
});
test('long qualified facts and embedded quotes remain intact',()=>{
 const value='工作日喝水，周末偶尔喝果汁。不是所有果汁都喜欢。朋友说“我喜欢咖啡”不代表我的偏好。';
 assert.equal(reply(value),value);
});

