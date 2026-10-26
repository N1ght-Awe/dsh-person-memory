import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { sensitivityOf } from '../person-policy.js';
import { memoryReply } from './memory-reply.js';
export function parseMemoryRequest(text) {
  const s=String(text||'').trim().replace(/^@[^\s]+\s+(?=\/记忆)/, '');
  const command=s.match(/^\/记忆\s+(保存|更正|查询|忘记)\s+(.+)$/s);
  if(command){
    const action={保存:'save',更正:'correct',查询:'recall',忘记:'forget'}[command[1]];
    if(['save','correct'].includes(action)) {const m=command[2].match(/^([^=：:]{1,80})[=：:]\s*(.+)$/s);return m?{action,topic:m[1].trim(),text:m[2].trim()}:{action:'help'};}
    return {action,topic:command[2].trim()};
  }
  if(/^\/记忆(?:\s|$)/.test(s))return {action:'help'};
  const save=s.match(/^(?:请)?(?:帮我)?(?:记住|记下|更正)(?:一下)?[：:,，\s]*(.+)$/s);
  if(save){
    const v=save[1],pair=v.match(/^([^=：:]{1,80})[=：:]\s*(.+)$/s);
    if(pair)return {action:s.includes('更正')?'correct':'save',topic:pair[1].trim(),text:pair[2].trim()};
    let topic=/暗号|口令/.test(v)?'暗号':/茶|咖啡|饮料|喝/.test(v)?'饮品偏好':/叫我|称呼|昵称/.test(v)?'称呼':/颜色/.test(v)?'颜色偏好':null;
    if(topic)return {action:s.includes('更正')?'correct':'save',topic,text:v};
    return {action:'help'};
  }
  if(/^(?:请)?(?:忘掉|忘记|删除)(?:我的|我之前的)?/.test(s))return {action:'forget',topic:s.replace(/^(?:请)?(?:忘掉|忘记|删除)(?:我的|我之前的)?/,'').trim()};
  // Deliberately limited, deterministic intent support. Other chat remains with DSH.
  if(/(?:还记得|记不记得|记得|知道|告诉(?:我|大家)|说说|查询|是什么|什么|多少)/.test(s)&&/(?:我|我们)/.test(s)&&!/(?:不要|别说|不能|不许|假如|转述|他说|她说)/.test(s)) {
    const topic=/暗号|口令|密码/.test(s)?'暗号':/茶|咖啡|饮品|喝/.test(s)?'饮品偏好':/昵称|称呼|名字|叫我/.test(s)?'称呼':/颜色/.test(s)?'颜色偏好':null;
    if(topic)return {action:'recall',topic,privateReply:/私聊(?:发|告诉|回复|给)|私信/.test(s)};
  }
  return null;
}
export function createPersonMemoryBridge({root,api,getConfig,getRole,ensureSession,isAllowed,send,read= p=>JSON.parse(fs.readFileSync(p,'utf8')),now=()=>Date.now(),uuid=()=>crypto.randomUUID(),transport}) {
  const home=process.env.DSH_HOME||path.join(os.homedir(),'.dsh');
  const keyFile=path.join(home,'session-memory/bridge-person.key');
  const ledgerFile=path.join(root,'state/person-memory-requests.json');
  let ledger={};try{ledger=read(ledgerFile);}catch(e){if(e.code!=='ENOENT')throw e;}
  const persist=()=>{fs.mkdirSync(path.dirname(ledgerFile),{recursive:true});const tmp=ledgerFile+'.tmp';fs.writeFileSync(tmp,JSON.stringify(ledger));fs.renameSync(tmp,ledgerFile);};
  const request=transport|| (async input=>{
    const c=getConfig().dsh;
    const cookie=await api.ensureAuth();
    const r=await fetch(new URL('/api/session-memory/person',c.baseUrl),{method:'POST',headers:{'content-type':'application/json',cookie,'x-person-memory-key':fs.readFileSync(keyFile,'utf8').trim()},body:JSON.stringify({input}),signal:AbortSignal.timeout(10000)});
    const j=await r.json();if(!j.ok)throw Error(j.error?.message||'人物记忆服务不可用');return j.value;
  });
  async function handle({kind,id,event,plainContent}) {
    const cfg=getConfig(),actor=String(event.user_id||''),key=kind+':'+id;
    if(cfg.personMemory?.enabled!==true)return false;
    if(/^(?:别发了|取消记忆回复)[。！!]?\s*$/.test(plainContent)&&actor===String(cfg.ownerQQ)){
      for(const r of Object.values(ledger))if(r.actor===actor&&r.key===key&&r.state==='pending')r.state='revoked';persist();return true;
    }
    const parsed=parseMemoryRequest(plainContent);if(!parsed)return false;
    if(actor!==String(cfg.ownerQQ)) {await send(key,'当前人物记忆仅为已绑定的私聊用户开放。');return true;}
    if(!isAllowed(key))return true;
    if(parsed.action==='help'){await send(key,'私聊保存：/记忆 保存 饮品偏好=喜欢气泡水\n查询：/记忆 查询 饮品偏好\n更正：/记忆 更正 饮品偏好=喜欢柠檬水\n忘记：/记忆 忘记 饮品偏好');return true;}
    const messageId=String(event.message_id??event.msg_id??event.message_seq??'');
    if(!messageId){await send(key,'这条消息缺少消息编号，请重新发送记忆请求。');return true;}
    const dedup=[event.self_id||'',key,messageId].join('|');
    if(ledger[dedup])return true;
    for(const [k,v] of Object.entries(ledger))if(v.at<now()-7*86400000)delete ledger[k];
    const role=getRole();
    const record=ledger[dedup]={requestId:uuid(),actor,key,messageId,role,at:now(),state:'pending'};persist();
    const destination=parsed.privateReply?'private:'+actor:key;
    const guard=()=>{if(record.state!=='pending'||getRole()!==role||String(getConfig().ownerQQ)!==actor||!isAllowed(key)||!isAllowed(destination))throw Error('请求已取消或身份/目标变化');};
    try{
      guard();const sessionId=await ensureSession(key);
      const input={...parsed,actor,key,sessionId,messageId,requestId:record.requestId};
      const result=await request(input);guard();
      if(result.status==='ready'){
        if(sensitivityOf({text:result.text,sensitivity:'normal'})!=='normal')throw Error('拒绝返回私密内容');
        const beforeSend=async()=>{guard();const current=await request(input);if(current.status!=='ready'||current.entryId!==result.entryId||current.revision!==result.revision)throw Error('记忆已变化，请重新查询');guard();record.state='committing';persist();};
        const receipt=await send(destination,memoryReply(result,{friendly:cfg.personMemory?.friendlyReplies===true,action:parsed.action}),beforeSend);
        record.state='sent';record.entryId=result.entryId;record.revision=result.revision;record.destination=destination;record.platformMessageId=receipt?.messageId??null;
      }else{
        await send(destination,memoryReply(result,{friendly:cfg.personMemory?.friendlyReplies===true,action:parsed.action}),async()=>{guard();record.state='committing';persist();});record.state='sent';record.destination=destination;
      }
    }catch(e){
      const wasCommitted=record.state==='committing';record.state=wasCommitted?'unknown':record.state==='revoked'?'revoked':'failed';
      // Never include server error text, original request, or remembered values in logs/status.
      if(!wasCommitted&&record.state!=='revoked')await send(key,'这次记忆操作没有完成，请稍后重试；没有确认发送成功。').catch(()=>{});
    }finally{persist();}
    return true;
  }
  return {handle};
}
