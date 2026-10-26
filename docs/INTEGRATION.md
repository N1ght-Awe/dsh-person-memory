# 接入指南

这份仓库可以直接运行合成演示。连接真实宿主需要实现下面的契约；把文件复制进插件目录并不能完成接入。

## 1. 身份与场合（Gate 0a）

IdentityMemory 读取由宿主管理的策略与 Session 映射。examples/support/fixture.js 是可执行的完整合成策略例子。

| 字段 | 来源 / 要求 |
| --- | --- |
| ownerId / personaId | 显式配置的账号和人格；不要接受模型自报身份 |
| personalCwd | 稳定的个人桶标识，不随会话变化 |
| bridgeRoot | 私聊工作区 |
| bridgeSessionsPath | 宿主维护的 private:<账号> / group:<群> 到当前 sessionId 映射 |
| roleStatePath | 宿主当前人格 |
| groups | 配置群及其工作区；当前实现要求群目录在 bridgeRoot 之下 |
| desktopSessions | 显式 sessionId + cwd + personId + personaId 绑定 |
| desktopWorkspaces | 工作区列表，本身不授予个人权限 |
| features.normalGroupDisclosure | 本人请求 normal 条目时，是否允许在群中回答 |
| legacyPrivateSessionIds | 仅用于按需检索旧历史；不是当前操作授权 |

路径规则使用 path.win32，目录须为绝对路径且不重复。先理解该限制，再移植到 POSIX 系统。映射文件、角色状态和策略文件都不能由模型任意写入。

## 2. 复用宿主存储，保持单写者

将 personOperation(policy, store, vectors, input) 接入宿主现有存储实例，不要新增一个进程直接操作同一 JSON 文件。

必须实现：

~~~js
store.bucketOf(cwd)                 // null 或 { entries, enabled, injectMode, ... }
store.entryOf(cwd, id)
store.add(cwd, patch, origin, sessionId) // { entry }
store.update(cwd, id, patch)            // { entry }
store.remove(cwd, ids)                  // { removed: [id, ...] }
vectors.drop(cwd, ids)
vectors.flush()
~~~

IdentityMemory.view 的向量适配还使用 recordOf、setShallow、setDeep、dirty。

存储适配器必须持久化 topic、sensitivity、assertion、revision、text、summary、tags、updatedAt，以及 source.ownerId / source.personaId / source.sessionId / source.origin。add/update 要把 sourceOwner/sourcePersona 转为对应 source 字段；update 保留来源并递增 revision。所有能更改正文、主题、敏感级别或披露条件的宿主入口都必须递增版本。删除失败或条目锁定不能伪装成功。

examples/support/store.js 只是一次性演示适配器：没有生产锁、事务、恢复或备份生命周期。不要用于真实记忆库。

## 3. 宿主人物接口（Gate 0b）

桥接默认向 getConfig().dsh.baseUrl 的 /api/session-memory/person 发送 POST：

~~~json
{
  "input": {
    "actor": "100",
    "key": "group:1",
    "sessionId": "group-now",
    "requestId": "synthetic-request",
    "messageId": "synthetic-message",
    "action": "recall",
    "topic": "饮品偏好"
  }
}
~~~

上述数据完全虚构。真实 actor/key/messageId 必须来自已验证的平台事件，不能来自模型参数。服务只应接受宿主认证与桥接认证共同通过的调用，不能暴露为 LLM 工具或任意网络 API。

默认传输适配器会调用 api.ensureAuth() 取得宿主 cookie，并读取 DSH_HOME/session-memory/bridge-person.key（未设置 DSH_HOME 时使用用户目录下的 .dsh）。宿主必须验证该独立密钥、现有认证与可信入口，再调用 personOperation。密钥由使用者在本机生成与保管，本仓库不附带密钥。也可传入 transport(input) 复用自己的已认证通道。

成功格式：{ ok: true, value: result }。失败格式：{ ok: false, error: { message: "..." } }。桥接不会把原始服务错误或记忆正文写入请求台账。

每次请求动态读取 dsh.baseUrl；不要复制示例以外的历史端口。

## 4. 保证 secret 在整个宿主中被排除

personOperation 只控制专用人物接口。接入时还要在所有模型工具、提示注入、Memory.md 导出、摘要排队、嵌入排队、搜索结果、面板到模型传输的入口使用 modelReadable。

~~~js
const visibleEntries = entries.filter(modelReadable);
~~~

这个过滤条件必须作用于真实入口，而不只是 UI 显示。专用保存命令要在普通模型消息、自动摘要、活动日志、词语采集等队列之前消费。网关原始日志和旧聊天副本也需单独管理；本模块不会清除它们。

仅连接人物接口并不能证明秘密不会经过宿主的其他功能。

## 5. 桥接配置与事件顺序

在实际配置加载器内调用 personMemoryConfig(file)，保留 enabled 与 friendlyReplies。只修改磁盘配置却忘记配置加载器，是一个会让功能静默走旧路径的故障点。

实例化 createPersonMemoryBridge 的参数：

| 参数 | 契约 |
| --- | --- |
| root | 桥接状态目录，其下 state/person-memory-requests.json 是请求台账 |
| getConfig | 返回当前 ownerQQ、personMemory、dsh.baseUrl |
| getRole | 当前可信人格 |
| ensureSession(key) | 获取当前 Session，并与宿主映射保持一致 |
| isAllowed(key) | 实时入口与目的地白名单 |
| send(key, text, beforeSend) | 在现有发送队列内、发送前执行并等待 beforeSend |
| api.ensureAuth / transport | 默认认证通道或显式自定义传输 |

收到可信平台消息后，在任何模型队列和内容日志之前：

~~~js
if (await personMemory.handle({ kind, id, event, plainContent })) return;
// 未消费的普通聊天继续走原来的模型流程。
~~~

SDK 发送由使用者提供。固定目标的安全骨架：

~~~js
function send(key, text, beforeSend = async () => {}) {
  return enqueueExistingSend(async () => {
    assertAllowed(key);
    await beforeSend();
    assertAllowed(key);
    return sendPlainTextToFixedTarget(key, text);
  });
}
~~~

这段是接口伪代码，enqueueExistingSend 等必须映射到你的实现。sendPlainTextToFixedTarget 应把正文当纯文本转义，不得让记忆中的 CQ 码或富文本改变收件人、触发操作。发送函数对所有路径都要检查白名单，包括帮助与错误提示。

若 beforeSend 抛错，不得继续发送。若平台结果不明，保留 unknown，不能盲目重投。台账必须只允许可信进程写入。

## 6. 接入验证与回退

先在独立测试宿主验证：配置是否到达实际处理器、Session 轮换、陌生人拒绝、子代理无个人绑定、群目标与本人私聊目标、更正/删除前后版本、取消、结果未知重投、secret 的全部模型入口。

本仓库的合成测试不能替代你的 DSH 路由认证和平台实收验收。

回退模块时保留新增数据；关闭人物功能即可停止此路径。不要用旧数据库整体覆盖新事实，也不要恢复 cwd 自动授予个人权限。服务安装与重启由接入者自行安排，本仓库不自动执行。

