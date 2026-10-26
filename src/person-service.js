import { sensitivityOf, credentialLike, cleanTopic, matchNormal } from './person-policy.js';
// Invoked only by the host-authenticated bridge endpoint; not exposed as an LLM tool.
export function personOperation(policy, store, vectors, input) {
  const p=policy.policy();
  if(p.version!==2 || String(input.actor)!==String(p.ownerId))throw Error('当前人物未启用私人记忆');
  if(policy.read(p.roleStatePath).role!==p.personaId)throw Error('当前人格未绑定');
  const sessions=policy.read(p.bridgeSessionsPath).sessions||{};
  const key=String(input.key||'');
  const privateKey='private:'+p.ownerId;
  const group=p.groups.find(g=>g.key===key);
  if(key!==privateKey&&!group)throw Error('当前场合未绑定');
  if(!input.sessionId||sessions[key]!==input.sessionId)throw Error('会话绑定已变化，请重试');
  if(!input.requestId||!input.messageId)throw Error('缺少真实消息关联');
  const topic=cleanTopic(input.topic);
  if(!topic)throw Error('请指定一项记忆主题');
  const entries=store.bucketOf(p.personalCwd)?.entries||[];
  const own=entries.filter(e=>(!e.source?.ownerId||e.source.ownerId===p.ownerId)&&(!e.source?.personaId||e.source.personaId===p.personaId));
  if(input.action==='recall') {
    if(group&&!p.features?.normalGroupDisclosure)throw Error('群内人物记忆回答尚未开启');
    if(sensitivityOf({text:topic,sensitivity:'normal'})!=='normal')return {status:'restricted',text:'这类私密内容不通过人物记忆自动返值，也不会发到群里。'};
    const matches=matchNormal(own,topic);
    if(matches.length!==1)return {status:matches.length?'ambiguous':'not-found',text:matches.length?'记忆里有不止一项符合这个主题，请把主题说具体一点。':'这件事我还没有可靠的记忆；你可以在私聊里明确告诉我记住。'};
    const e=matches[0];
    return {status:'ready',entryId:e.id,revision:e.revision||1,text:e.text,personId:'qq:'+p.ownerId,personaId:p.personaId};
  }
  if(group)throw Error('保存、更正和遗忘请在本人私聊中进行');
  const exact=own.filter(e=>cleanTopic(e.topic)===topic);
  if(exact.length>1)throw Error('主题重复，请先在面板整理');
  if(input.action==='forget') {
    if(!exact.length)return {status:'not-found',text:'没有找到这个主题的记忆。'};
    const e=exact[0],result=store.remove(p.personalCwd,[e.id]);
    if(!result.removed.includes(e.id))throw Error('这条记忆尚未删除，请检查锁定状态');
    vectors.drop(p.personalCwd,[e.id]);vectors.flush();
    return {status:'forgotten',text:'已忘掉这项记忆。'};
  }
  if(!['save','correct'].includes(input.action))throw Error('未知人物记忆操作');
  const text=String(input.text||'').trim();
  if(!text)throw Error('记忆内容不能为空');
  if(credentialLike(text))throw Error('不保存登录密码、API key 或会话令牌');
  if(input.action==='correct'&&!exact.length)return {status:'not-found',text:'没有找到这个主题；请先保存或使用已有主题。'};
  const sensitivity=sensitivityOf({text,topic,sensitivity:'normal'});
  const patch={text,topic,sensitivity,assertion:'user-stated',summary:sensitivity==='normal'?text.slice(0,240):'[私密条目，不注入模型]',tags:[topic],sourceOwner:p.ownerId,sourcePersona:p.personaId,sourceWorkspace:p.bridgeRoot};
  const result=exact.length?store.update(p.personalCwd,exact[0].id,patch):store.add(p.personalCwd,patch,'person-bridge',input.sessionId);
  const e=result.entry;vectors.drop(p.personalCwd,[e.id]);vectors.flush();
  return {status:exact.length?'updated':'saved',entryId:e.id,revision:e.revision||1,text:sensitivity==='normal'?(exact.length?'已更新':'已记住')+'这项记忆，换聊天窗口也会保留。':'已保存为私密条目；不会交给模型或在群里返值。'};
}
