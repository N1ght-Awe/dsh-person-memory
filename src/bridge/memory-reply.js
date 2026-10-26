// Presentation only: authorization and revision checks remain in person-memory.js.
export function memoryReply(result, {friendly = false, action} = {}) {
  if (result.status === 'ready') {
    let fact = String(result.text || '').trim();
    // Old model-written dossiers are not safe conversational facts. Do not guess
    // which quoted historical value is current or send the whole record.
    if (!fact || /QQ\s*[:：]?\s*\d{5,}|(?:记忆保存|保存记忆)指令|(?:主人|用户|owner)[（(]|\d{4}-\d{2}-\d{2}.*(?:私聊|群聊)|主题标签|会话编号/.test(fact))
      return '这条旧记忆混进了记录说明，我得先核对，免得说错。';
    // Only change the leading speaker of a simple, explicit personal fact.
    // Never rewrite embedded quotes, negations, time qualifiers or recommendations.
    fact = fact.replace(/^我(?=(?:喜欢|不喜欢|更喜欢|爱喝|不喝|偏爱|讨厌))/, '你');
    if (/^(?:喜欢|不喜欢|更喜欢|爱喝|不喝|偏爱|讨厌)/.test(fact)) fact = '你' + fact;
    if (friendly && /^你喜欢[^，。！？!?；;\n]{1,32}[。]?$/u.test(fact))
      return fact.replace(/[。]$/, '') + '，记着呢。';
    return /[。！？!?…]$/.test(fact) ? fact : fact + '。';
  }
  if (['saved', 'updated'].includes(result.status) && /私密/.test(result.text || ''))
    return '记下了，按私密内容保存。这类内容不会在聊天里自动说出来。';
  if (result.status === 'saved') return friendly ? '嗯，记住了。' : '记住了。';
  if (result.status === 'updated') return '改好了，以这次说的为准。';
  if (result.status === 'forgotten') return '这条记忆删掉了。';
  if (result.status === 'ambiguous') return '有几条都对得上，你指哪一件？';
  if (result.status === 'not-found') return action === 'recall' ? '这件事我还没记住，不瞎猜。' : '没找到这条，你再说一下是哪件事？';
  if (result.status === 'restricted') return '这类私密内容不会在聊天里自动说出来。';
  return '这次没处理好，稍后再试一下。';
}
