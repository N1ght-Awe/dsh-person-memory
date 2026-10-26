# DSH Person Memory

[English](README.en.md) · [接入指南](docs/INTEGRATION.md) · [范围与限制](docs/LIMITATIONS.md)

一个从实际 DSH 记忆改造中提取的**人物记忆参考实现**：同一个人在不同 Session、私聊和配置群中使用同一份人物记录，同时把身份识别、披露权限和聊天表达分开。

适合已经有 DSH / 聊天桥接、遇到“换窗口不认识人”“私聊记住了群里却读不到”“回复像档案摘要”的开发者。本仓库提供核心模块、合成测试和离线演示；**不是完整 DSH 插件，也不是覆盖安装包**。

## 先运行演示

需要 Node.js 22.13 或更新版本，无第三方运行依赖，无需 npm install。

~~~sh
node --import ./tests/no-network.mjs examples/demo.mjs
node --import ./tests/no-network.mjs --test tests/person.test.mjs tests/bridge.test.mjs tests/reply.test.mjs
node scripts/check-package.mjs
~~~

也可使用 npm run demo、npm test、npm run check。演示只使用自己创建的临时目录；账号 100、群 1、Windows 示例路径和事实全部是虚构数据。网络调用被测试预加载器禁用，发送函数只打印合成结果，不发现或连接本机 DSH / QQ。

演示过程：私聊保存 → 切换 Session → 群查询 → 私聊更正 → 群内请求发给本人私聊 → 遗忘 → 查询不再命中。

## 这份方案处理什么

| 层 | 职责 |
| --- | --- |
| IdentityMemory（Gate 0a） | 依照宿主可信的账号、当前 Session 与人格映射认人；桌面会话显式绑定，子代理不会因 cwd 相同自动继承 |
| personOperation（Gate 0b 服务） | normal 的保存、更正、查询、遗忘；使用现有宿主存储的单一写入路径 |
| createPersonMemoryBridge | 从真实平台事件取发送者，固定目标，发送前复查条目版本，记录重投与结果未知状态 |
| memoryReply | 将可靠事实简短表达；保留否定、条件和历史变化，遇到已知旧档案格式要求核对 |
| 宿主接入 | 负责认证、白名单、入口顺序、发送队列，以及所有模型/导出/摘要/向量入口的过滤 |

secret 专用保存路径只返回状态，查询不自动返回正文，群里不披露。秘密以宿主原有方式存储，**这不等于加密存储**。关键词分类是有限规则，不是完整隐私检测器。

## 文件

- src/identity-memory.js：身份范围、授权视图及提示构造。
- src/person-policy.js、src/person-service.js：分类、主题匹配与人物操作。
- src/bridge/：请求解析、桥接状态、简短回复与配置字段投影。
- examples/：可运行演示与仅用于演示的存储适配器。
- tests/：完全合成的独立回归。
- docs/INTEGRATION.md：宿主接入契约、接口和检查点。
- docs/PRIVACY.md：发布包范围及后续贡献的数据要求。
- docs/VALIDATION.md：本仓库验证范围。
- RELEASE-MANIFEST.json：发布时所有文件的 SHA-256 清单。

## 接入之前

当前身份路径规则按 Windows 设计。当前策略针对一个绑定用户和配置群，未实现通用多租户授权。生产接入要复用原 MemoryStore，不能把 examples 的存储适配器连接到真实数据。

开始前阅读[接入指南](docs/INTEGRATION.md)与[限制](docs/LIMITATIONS.md)。仓库没有自动安装、服务重启、迁移旧数据或发送真实平台消息的脚本。

## 来源和许可

MIT。源方案基于 [dsh-workspace-recollection](https://github.com/reaxlll/dsh-workspace-recollection) 的本地扩展，并接入已有 QQ bridge。保留相关版权通知，详见 [NOTICE](NOTICE.md)。本仓库不分发 DSH、QQ 客户端、网关、模型或第三方 SDK。

欢迎用合成数据报告问题与贡献适配器；不要附带聊天记录、真实账号、记忆库或凭据。

