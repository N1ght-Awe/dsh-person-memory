// Shared pure policy. Kept independent of DSH so the bridge and tests can reuse it.
export function sensitivityOf(entry = {}) {
  const text = [entry.text, entry.summary, entry.topic, ...(entry.tags || [])].filter(Boolean).join(' ');
  if (entry.sensitivity === 'third-party') return 'third-party';
  if (entry.sensitivity === 'secret' || /暗号|口令|密码|令牌|token|api.?key|secret|身份证|银行卡|病历|诊断|财务/i.test(text)) return 'secret';
  return entry.sensitivity === 'normal' || ['agent','panel','person-bridge'].includes(entry.source?.origin) ? 'normal' : 'restricted';
}
export const modelReadable = entry => sensitivityOf(entry) === 'normal';
export const credentialLike = text => /(?:api[_ -]?key|access[_ -]?token|会话令牌|登录密码|账户密码|账号密码)\s*[:：=]?\s*\S{6,}/i.test(String(text));
export function cleanTopic(topic) { return String(topic || '').trim().replace(/[？?。！!]+$/g, '').slice(0, 80); }
export function matchNormal(entries, query) {
  const q = cleanTopic(query).toLowerCase();
  if (!q) return [];
  const normal = entries.filter(modelReadable);
  const exact = normal.filter(e => e.topic && cleanTopic(e.topic).toLowerCase() === q);
  if (exact.length) return exact;
  const concepts = [ ['茶','饮品','喝','饮料','咖啡'], ['颜色','色彩'], ['称呼','名字','昵称','叫我'], ['食物','吃','口味'], ['爱好','兴趣'] ];
  const matchedConcepts = concepts.filter(xs => xs.some(x => q.includes(x)));
  const terms = q.replace(/你|还|记得|记住|告诉|大家|我的|我|什么|是|吗|呢|之前|私聊|群里|喜欢|偏好|多少/g, ' ').split(/\s+/).filter(x=>x.length>1);
  const score = e => {
    const h=[e.topic,e.text,e.summary,...(e.tags||[])].join(' ').toLowerCase();
    return (h.includes(q)?20:0) + terms.reduce((n,t)=>n+(h.includes(t)?3:0),0) + matchedConcepts.reduce((n,xs)=>n+(xs.some(x=>h.includes(x))?2:0),0);
  };
  return normal.map(e=>({e,s:score(e)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).filter((x,i,xs)=>x.s===xs[0].s).map(x=>x.e);
}
