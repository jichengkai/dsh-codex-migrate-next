# DeepSeek Harness 最新版兼容性核验（2026-09-06）

## 结论

不能确认“本次更新没有破坏插件”。结论需要按发布渠道区分：

- **npm 默认版本 `@deepseek-ai/dsh@0.1.2-rc.1`：已确认当前插件的核心可用性没有被破坏。** 在隔离的 fresh Web Profile 中，当前 `2.0.0` tarball 能安装并参与 bundle 组合；DSH 能启动；插件设置页、Typert Remote 状态读取和浏览器模块均正常；最小 Codex JSONL 成功导入为 1 个 DSH Session 并挂到 Workspace；重启后 Workspace 与会话仍能恢复，浏览器无 page/console error。安装仍报告 peer warnings，客户端 manifest 也保留旧包名与 `immediately: true`，因此这是“实测可用但声明需整理”，不是“零风险长期兼容”。
- **GitHub 最新 Release `0.1.3-alpha.1`：当前插件的 DSH 会话导入功能确定不兼容。** DSH 已把持久化 API 改成生命周期持有的 `SessionHandle`；本插件仍直接调用 service 级 `create/append/load/inspect/list`，其中多个入口已删除或更改语义。即使 UI 和 Remote 能加载，会话导入、检测和恢复路径也会失败或被跳过。

因此，用户如果通过 npm 普通安装升级到了 `0.1.2-rc.1`，当前 `2.0.0` 可以继续使用，且核心导入路径已有真实宿主证据；如果使用 GitHub `0.1.3-alpha.1`，应明确阻止或提示不兼容，直到完成 SessionHandle 适配。

## 当前发布事实

截至 2026-09-06：

| 渠道 | 最新版本 | 发布时间/状态 | 对本插件的意义 |
|---|---|---|---|
| npm `latest` / `next` | `0.1.2-rc.1` | 2026-09-03 左右发布 | 普通 `npm` / `npx` 用户最可能升级到的版本 |
| npm `alpha` | `0.1.2-alpha.5` | 早于 rc.1 | 已被 rc.1 取代，不应作为新兼容目标 |
| GitHub Release | `0.1.3-alpha.1` | 2026-09-04 | 源码/预览用户可能使用；含明确 breaking persistence 变更 |

来源：[npm 版本页](https://www.npmjs.com/package/@deepseek-ai/dsh?activeTab=versions)、[GitHub Releases](https://github.com/deepseek-ai/deepseek-harness/releases)、[`0.1.2-rc.1` 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1)、[`0.1.3-alpha.1` 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)。

两个目标版本的 Node 要求均为 `^22.19.0 || >=24.0.0`，没有再次抬升：[rc.1 根 package.json](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.2-rc.1/package.json)、[alpha.1 根 package.json](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.3-alpha.1/package.json)。本项目目前未在自身 `package.json` 声明 `engines`，建议补上相同门槛，但这不是此次 API 破坏的根因。

## 对当前插件的逐项检查

### 1. 插件加载与 `dsh.bundle`

`package.json#dsh.bundle.patch` 和 Profile patch 仍是官方插件激活机制；没有 bundle 声明的包只会作为依赖安装而不会激活。因此本插件的 `cordis.patch.yml` 外壳在 rc.1 和当前主线仍是正确方向。[官方发布/Bundle 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)

风险不在 bundle 本身，而在依赖与客户端模块清单：

- 当前 peer 为 `@deepseek-ai/dsh-home-paths`、`dsh-tools`、`dsh-typert-protocol` 的 `^0.1.0-rc.6`。SemVer 对 prerelease 的匹配不会自然覆盖新的 `0.1.2-rc.1`，可能导致安装冲突或 profile 内出现旧版副本。
- 当前 `dsh.client.immediately: true` 不符合最新客户端约束。官方规定它只给一级预取基础设施；业务插件应移除。[客户端插件规范](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md)

### 2. Client modules 与 UI slots

本插件仍注入：

- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-web-react`
- `@deepseek-ai/dsh-client-ui-settings`
- `@deepseek-ai/dsh-client-ui-slots`
- `@deepseek-ai/dsh-api-remotes`

其中 `dsh-client-runtime` 在 npm 的最后一条 0.1 系发布是 `0.1.1-rc.2`，没有 `0.1.2-rc.1`；会话 UI 在 0.1.2 已拆包。官方仍保留 `conversation.chat.assistant-actions`，但其声明/渲染拥有者已进入新的会话 UI 包（当前源码文档称 `ui-conversation`，release tag 中相应包为 `@deepseek-ai/dsh-client-ui-chat`）。[runtime npm 版本](https://www.npmjs.com/package/@deepseek-ai/dsh-client-runtime?activeTab=versions)、[rc.1 UI Chat 包](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/packages/client/ui-chat/package.json)、[官方 Feedback 子系统中的 slot 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/feedback.md)

`settings.section` 和 `conversation.chat.assistant-actions` 的注册代码本身没有发现被删。fresh-profile 浏览器实测证明旧 inject 清单目前仍能完成模块物化，设置页可见且无客户端错误；不过仍应按 rc.1 的实际包图整理 manifest，避免后续版本移除兼容路径。

### 3. Typert Remote

本插件使用 `TypertRemoteService`、`Remote` marker 和客户端 `ctx.remote.$mount()`。这些仍是官方当前 API Gateway 模型；被移除的是旧 APIProxy 调用面。因此 Remote 路线本身没有被这次更新破坏。[官方 API Gateway 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)

但本插件手写 Remote 方法标记与描述符，而非使用官方生成产物；再叠加 `dsh-typert-protocol` peer 范围过旧，仍存在协议实例漂移风险。此项是“架构仍有效、发布物未验证”，不是“零风险兼容”。

### 4. Session persistence

这是决定性差异。

在 `0.1.2-rc.1`，service 仍提供 `create(): Promise<void>`、`append(id, events)`、`load(id)`、`inspect(id)` 和 `list()` 一类旧入口，本插件使用方式与其大致一致。[rc.1 persistence 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.2-rc.1/packages/session/session-persistence/src/index.ts)

在 `0.1.3-alpha.1`，官方发布说明将 persistence 标记为 breaking：写入由生命周期持有的 `SessionHandle` 管理，并加入单 Session 单进程写锁。service 改为 `create(): Promise<SessionHandle>`、`open(id, 'read' | 'write')`、`stat()` 等；旧的 service 级 `append/load/inspect` 不再存在，`list()` 的返回也不再是原来的 header 语义。[alpha.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)、[alpha.1 persistence 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.3-alpha.1/packages/session/session-persistence/src/index.ts)

本插件在 `src/logic.js` 中多处直接调用：

- `create({ version: 0, id, createdAt, cwd })`
- `append(id, events)`
- `load(id)` / `inspect(id)`
- `list()` 并按旧 header 结构遍历

所以 alpha.1 下的 Codex→DSH 会话创建、重复检测、已有会话读取、项目枚举和恢复路径均受影响。这不是单纯类型错误，而是生命周期、锁和读取模型变化，必须增加按能力探测的新 adapter，正确获取并释放 handle。

### 5. Workspace

当前插件使用 `workspaceRegistry.resolveByPath/create/list/archiveSession/archivedSessionIds`。本轮官方 Release 没有给出这些入口被整体删除的直接证据；但 alpha.1 的 session handle/锁变更会影响与 workspace 绑定、归档后检查和枚举组合流程。此项不能单独认定兼容，需在完成 SessionHandle 适配后做真实 workspace 回归。

### 6. `Session.events`

`0.1.2-rc.1` 将客户端 Session 的直接 `events` 属性替换为 `seq`、`eventAt()`、`snapshotEvents()`。[rc.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1)

对当前插件的静态搜索没有发现读取客户端 `Session.events`；它读取的是 Host persistence 返回的事件。因此这个 breaking change 不直接击中现有代码，但未来若新增客户端会话读取不能沿用旧 API。

## 本地验证结果

在当前工作树上执行插件自身测试：

- `npm test`：56/56 通过；
- `npm run build`：通过，且构建后工作树无差异。

随后对 npm `0.1.2-rc.1` 做了隔离 fresh-profile 测试（独立 `DSH_HOME`、随机本地端口、无浏览器弹窗）：

- `dsh plugin --profile web add <当前 2.0.0 tarball>`：成功，bundle 被加入 profile；pnpm 报 5 项 peer warning，但未阻断安装或运行；
- `--dump-config`：成功，`dsh-codex-migrate` patch 正确进入组合树；
- Web 启动：成功；
- 插件设置页：成功显示，状态 Remote 返回正常，浏览器无 page/console error；
- 最小 JSONL 同步：1 个 Session 新建、1 个 Workspace attach、0 failed；
- 重启恢复：成功，`codex-unprojected` Workspace 和导入会话仍可见，浏览器无错误。

本轮没有构建或运行 GitHub `0.1.3-alpha.1`，对它的不兼容结论来自官方明确的 breaking release note、对应版本 persistence 源码和本插件直接调用点的静态对照；证据足以确认旧写入接口不能原样工作。

## 风险分级与建议

| 目标 | 判定 | 现在是否可声明支持 |
|---|---|---|
| npm `0.1.2-rc.1` | fresh install、启动、设置页、Remote、单会话导入、Workspace attach、重启恢复均通过；仍有 peer warning 和陈旧 inject | **是，可继续使用；发布前宜整理声明** |
| GitHub `0.1.3-alpha.1` | persistence 调用模型确定破坏当前实现 | **否，必须先适配 SessionHandle** |

建议按以下顺序处理：

1. 先以 npm `0.1.2-rc.1` 为正式兼容目标，更新 peer 范围和客户端模块清单，移除 `immediately: true`。
2. 建立 DSH persistence adapter，同时支持 rc.1 旧 service 与 alpha.1 `SessionHandle`；不要在业务逻辑中散布版本判断。
3. 对 rc.1 做 fresh profile 的安装、启动、设置页、assistant action、单会话导入、项目导入、重启后打开、归档/恢复和卸载测试，并确认没有 Cordis/Typert 双实例。
4. alpha.1 适配完成后额外测试并发写锁、handle 释放、异常中断和 Windows 安装；在此之前给出明确的版本上限或启动警告。
