# DSH Person Memory · 人物记忆参考实现

**同一个人，换 Session、换私聊、进群，仍然被认成同一个人。**
记忆跟着人走；场景只决定这一次能用哪些、能不能说。

[English](README.en.md) · [接入指南](docs/INTEGRATION.md) · [已知限制](docs/LIMITATIONS.md) · [验证范围](docs/VALIDATION.md)

---

## 这是什么

一套**可运行的参考实现**：从一次真实的 DSH 记忆改造中抽出的核心模块，加上离线演示、28 项合成回归和一份接入契约。

它解决的是「认人」：把**平台账号 + 人格**绑定成稳定人物，让私聊、桌面 Session、配置群共享同一份人物档案；同时把「认人」「能不能用」「能不能说」拆成三层，任何一层都不靠提示词自觉。

**它不是什么（很重要）**：

- 不是 DSH 插件，不是 npm 包；**不能 `npm install`，也不能复制进插件目录就生效**；
- 不包含安装器、服务启停、数据迁移或真实 QQ 发送脚本；
- 不是通用多租户 / 加密保险库 / 完整事务消息系统。

如果你想要「装个插件就能用」，这个仓库不适合；如果你已经有 DSH 和聊天桥接，想照着实现「认人 + 按场景授权」，它适合。

## 它具体解决什么

| 场景 | 没有人物记忆 | 有这套模块 |
| --- | --- | --- |
| 换 Session / 换窗口 | 重新自我介绍，像第一次见 | 同一人物档案，直接接着聊 |
| 私聊记住、群里被问 | 群里读不到，或整段私聊被倒出来 | 本人明确索要时只回答对应条目；别人问拿不到 |
| 说错了要更正 | 新旧值混在一起 | 更正保留 revision 和条件，旧值不复活 |
| 说「忘掉」 | 下次又从旧聊天 / 摘要里冒出来 | 删除台账 + 派生失效，旧来源不复活 |
| 群里有人冒名 | 分不清是不是本人 | 发送者来自可信平台事件；文本自称不算 |
| 子代理 / 同目录 | 自动继承全部私人记忆 | 默认不继承，必须显式绑定 |

## 30 秒跑起来（不需要安装）

要求 Node.js >= 22.13，无第三方运行依赖：

```sh
git clone https://github.com/N1ght-Awe/dsh-person-memory.git
cd dsh-person-memory
node --version        # 需要 v22.13 或更新
npm run demo
npm test
npm run check
```

`npm run demo` 的预期输出（合成数据，不连接任何服务）：

```json
{"destination":"private:100","text":"嗯，记住了。"}
{"destination":"group:1","text":"你喜欢气泡水，记着呢。"}
{"destination":"private:100","text":"改好了，以这次说的为准。"}
{"destination":"private:100","text":"你不喜欢气泡水，周末偶尔喝柠檬水。"}
{"destination":"private:100","text":"这条记忆删掉了。"}
{"destination":"group:1","text":"这件事我还没记住，不瞎猜。"}
Demo passed. Synthetic data only; no server or platform messages.
```

`npm test`：28 项全部通过。`npm run check`：逐文件核对 SHA-256 发布清单，并检查凭据、本机路径、运行态文件与账号形态。

## 接到你自己的 DSH（不是复制文件）

> 完整字段、接口和故障点见 [docs/INTEGRATION.md](docs/INTEGRATION.md)。下面是路线图，每一步都有可检查的产物。

**前提**：DSH 0.2.1.x；Node >= 22.13；当前路径规则按 Windows 写（POSIX 需自行适配）；已有可复用的 MemoryStore；可选已有 QQ 桥接。

**第 1 步：准备身份策略（Gate 0a）**

写一份策略文件，明确「谁是这个人、哪些 Session / 工作区 / 群属于他」：

```json
{
  "version": 2,
  "ownerId": "100",
  "personaId": "assistant",
  "personalCwd": "C:/example/person",
  "bridgeRoot": "C:/example/bridge",
  "bridgeSessionsPath": "<state>/sessions.json",
  "roleStatePath": "<state>/role.json",
  "desktopWorkspaces": ["C:/example/desktop"],
  "desktopSessions": [
    { "sessionId": "desktop-1", "cwd": "C:/example/desktop", "personId": "qq:100", "personaId": "assistant" }
  ],
  "groups": [{ "key": "group:1", "cwd": "C:/example/bridge/group1" }],
  "features": { "normalGroupDisclosure": true },
  "legacyPrivateSessionIds": []
}
```

检查点：`ownerId / personaId` 来自显式配置，不来自模型；`bridgeSessionsPath` 是宿主维护的 `private:<账号>` / `group:<群>` → 当前 Session 映射；目录必须是绝对路径且不重复。

**第 2 步：复用宿主存储（单写者）**

把 `personOperation(policy, store, vectors, input)` 接到现有存储实例上，不要另起进程直接写同一份 JSON。存储适配器至少要提供：

```js
store.bucketOf(cwd)
store.entryOf(cwd, id)
store.add(cwd, patch, origin, sessionId)
store.update(cwd, id, patch)
store.remove(cwd, ids)
vectors.drop(cwd, ids)
vectors.flush()
```

检查点：`add / update` 写入 `source.ownerId / source.personaId / source.sessionId / source.origin` 和 `revision`；所有改正文的入口都递增版本；`examples/support/store.js` 只是演示适配器，**不能用于真实库**。

**第 3 步：暴露人物接口（Gate 0b）**

桥接向 `getConfig().dsh.baseUrl` 的 `/api/session-memory/person` 发 POST：

```json
{
  "input": {
    "actor": "100",
    "key": "group:1",
    "sessionId": "group-now",
    "requestId": "req-1",
    "messageId": "msg-1",
    "action": "recall",
    "topic": "饮品偏好"
  }
}
```

检查点：`actor / key / messageId` 只能来自已验证的平台事件，不能来自模型参数；接口只接受宿主认证 + 桥接认证，**不能注册成 LLM 工具**；默认认证读取 `DSH_HOME/session-memory/bridge-person.key`，密钥由接入者生成和保管。

**第 4 步：过滤所有模型可见入口（secret）**

只接人物接口不够。所有模型工具、提示注入、`Memory.md` 导出、摘要排队、嵌入排队、搜索结果、面板到模型的入口都要过同一层：

```js
const visibleEntries = entries.filter(modelReadable);
```

检查点：secret 条目的正文不出现在任何模型可见路径；专用保存命令要在普通消息、自动摘要、活动日志之前被消费。

**第 5 步：桥接接线**

在模型队列之前处理人物请求：

```js
if (await personMemory.handle({ kind, id, event, plainContent })) return;
// 未消费的普通聊天继续走原来的模型流程
```

发送必须固定目标，并在发送前复查：

```js
function send(key, text, beforeSend = async () => {}) {
  return enqueueExistingSend(async () => {
    assertAllowed(key);
    await beforeSend();       // 撤销 / revision / 目的地检查
    assertAllowed(key);
    return sendPlainTextToFixedTarget(key, text);
  });
}
```

检查点：`beforeSend` 抛错就不发；平台结果不明保留 `unknown`，不盲目重投；台账只允许可信进程写。

**第 6 步：验证与回退**

先在独立测试宿主逐项过：配置到达实际处理器、Session 轮换、陌生人拒绝、子代理无绑定、群目标与本人私聊目标、更正 / 删除前后版本、取消、结果未知重投、secret 的全部模型入口。

回退时关闭人物功能即可，保留新数据；**不要用旧库整体覆盖新事实，也不要恢复「同目录即个人权限」**。

### 接入检查表

| 步骤 | 改哪里 | 怎么算过 |
| --- | --- | --- |
| 认人 | 策略 + Session 映射 | 换 Session 仍是同一人物；陌生人 / 子代理拿不到 |
| 存储 | 宿主 MemoryStore | 单写者；revision 递增；删除不复活 |
| 人物接口 | 桥接 → `/api/session-memory/person` | 伪造 actor / 改目的地被拒绝 |
| secret 过滤 | 所有模型可见入口 | 模型上下文里没有 secret 正文 |
| 发送 | 桥接发送队列 | 固定目标；撤销后不发；结果未知不重投 |
| 回退 | 功能开关 | 关闭后普通聊天与官方压缩仍可用 |

## 架构

```text
可信平台事件（actor / messageId / chat）
        │
        ▼
QQ 桥接适配 ──► personOperation（Gate 0b）
        │              │
        │              ├─ IdentityMemory（Gate 0a，认人）
        │              ├─ person-policy（normal / secret）
        │              └─ 宿主 MemoryStore（单写者）
        ▼
memoryReply / 固定目标发送
```

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| IdentityMemory | `src/identity-memory.js` | 认人、可读范围、提示构造 |
| personOperation | `src/person-service.js` | 保存 / 更正 / 查询 / 遗忘，版本与范围 |
| person-policy | `src/person-policy.js` | normal / secret 分类、主题匹配、模型可见过滤 |
| person-memory bridge | `src/bridge/person-memory.js` | 请求解析、请求台账、固定目标、发送前复查 |
| memoryReply | `src/bridge/memory-reply.js` | 简短回复，保留否定、条件和历史变化 |

## 仓库结构

```text
src/            核心模块（身份、策略、服务、桥接、回复）
examples/       可运行演示与仅用于演示的存储适配器
tests/          28 项完全合成的独立回归
docs/           接入指南、限制、隐私、验证
scripts/        发布清单检查
RELEASE-MANIFEST.json   逐文件 SHA-256
```

## 验证与限制

本仓库验证的是**核心模块 + 演示 + 合成测试**：28 项回归通过、演示端到端通过，测试预加载器禁用网络。**没有**验证真实宿主认证、生产 MemoryStore、真实平台实收、长上下文压缩、崩溃恢复或并发多写者。详见 [docs/VALIDATION.md](docs/VALIDATION.md)。

开始接入前请读 [docs/LIMITATIONS.md](docs/LIMITATIONS.md)。最重要的几条：

- 当前面向**一个绑定用户 + 一个配置群**，没有多租户、自动注册或绑定 UI；
- 路径规则按 Windows 写，POSIX 需适配；
- normal / secret 是**有限规则分类**，会漏判和误判，不是完整隐私检测器；
- secret 不加密，不提供本机认证 UI，群里不披露；
- 发送前复查缩小了旧值窗口，但不是存储与平台之间的原子事务；
- 旧聊天、旧备份、已有向量不会自动清除；遗忘单个条目不等于全链路擦除。

## 来源与许可

MIT。源方案基于 [dsh-workspace-recollection](https://github.com/reaxlll/dsh-workspace-recollection) 的本地扩展，并接入已有 QQ bridge；相关版权与许可见 [NOTICE](NOTICE.md) 与 `LICENSES/`。本仓库不分发 DSH、QQ 客户端、网关、模型或第三方 SDK。

欢迎用**合成数据**报告问题、贡献适配器；不要附带聊天记录、真实账号、记忆库、备份或凭据。
