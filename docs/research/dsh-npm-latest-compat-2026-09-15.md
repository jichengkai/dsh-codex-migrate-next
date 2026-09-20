# DSH npm latest 兼容性核验（2026-09-15）

## 判定

**当前 `dsh-codex-migrate@2.0.0` 不能声明兼容 npm latest。** 按 Issue #1 的政策，本报告只检查 npm registry 的 `@deepseek-ai/dsh@latest`，忽略 GitHub alpha 和 npm `next`。

截至 2026-09-15，`latest` 是 **`0.1.5-rc.1`**（2026-09-10T03:12:53Z）；`0.1.5-rc.2` 只是 `next`，不纳入判断。[npm 官方版本页](https://www.npmjs.com/package/@deepseek-ai/dsh?activeTab=versions)

相对上次核验的 `0.1.2-rc.1`，真正阻断本插件的是正式进入 latest 的 Session persistence 重构：`sessionPersistence` 已改为生命周期持有的 `SessionHandle`。本插件仍直接调用旧 service 级 `append/load/inspect`，并按旧语义使用 `create/list`，因此“Sync now → 导入为 DSH 会话”确定不兼容。`dsh.bundle`、客户端模块机制、Typert Remote、WorkspaceRegistry 现用方法和两个 UI slot 本身仍存在。

## 官方变化与当前代码对照

| 检查项 | `0.1.5-rc.1` 官方状态 | 当前插件 | 判定 |
|---|---|---|---|
| `dsh.bundle.patch` | 仍是正式插件激活方式 | 使用 `cordis.patch.yml` | 兼容 |
| `dsh.client` | 仍支持 `platform/inject/immediately`，新增可选 `external` | `platform: web`、导出 `./client` | 机制兼容，但 inject 陈旧 |
| Typert Remote | `TypertRemoteService`、`@Remote`、`ctx.remote`、`$mount()` 仍保留 | 正在使用这些接口 | 路线兼容 |
| `sessionPersistence` | `create/open` 返回/使用 `SessionHandle`，写入经 handle；`list` 返回 snapshots | 直接 `create/append/load/inspect/list` | **确定破坏** |
| `workspaceRegistry` | `create/list/resolveByPath/archiveSession/archivedSessionIds` 仍存在 | 使用上述接口 | 静态兼容 |
| `settings.section` | 仍是正式 root/list slot | 注册该 slot | 静态兼容 |
| `conversation.chat.assistant-actions` | 当前 contract 和官方 feedback 消费方仍使用 | 注册该 slot | 静态兼容 |
| Node engine | `^22.19.0 || >=24.0.0` | 本机 E2E 为 Node 24.18.0 | 满足 |

官方来源：[`0.1.5-rc.1` Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)、[插件发布文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.1/docs/user/develop/basic/publish.md)、[client modules 源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.1/packages/client/modules/src/index.ts)、[API Gateway 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)、[rc.1 persistence 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/packages/session/session-persistence/src/index.ts)、[`settings.section` contract](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/packages/client/ui-settings/src/client/contract/slots.ts)、[`assistant-actions` contract](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/contract/slots.ts)、[官方 feedback 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/feedback.md)、[根 package.json](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/package.json)。

## Session persistence：明确阻断

当前 `lib/logic.js` 的关键调用包括：

- `persistence.create(header)` 后忽略返回值；
- `persistence.append(id, events)`；
- `persistence.load(id)` / `persistence.inspect(id)`；
- `persistence.list()` 后按旧 SessionHeader 数组读取。

在实际安装的 0.1.5 发布依赖中，`SessionPersistence` 类型为：

- `create(...): Promise<SessionHandle>`；
- `open(id, access): Promise<SessionHandle>`；
- `list(...): Promise<readonly SessionPersistenceSnapshot[]>`；
- `append(events)` 位于 `SessionHandle`，不在 service 上。

因此当前导入路径在能力检查 `typeof persistence.append !== 'function'` 处会直接判定服务不可用并跳过，或者其他读取路径因 `load/inspect` 消失而失败。这会破坏插件最核心的 Codex→DSH 会话落库与恢复能力。

## Client modules 与 slots

当前包的 inject 仍包含：

- `@deepseek-ai/dsh-client-runtime`
- `@deepseek-ai/dsh-client-web-react`
- `@deepseek-ai/dsh-client-ui-slots`

fresh profile 的 0.1.5-rc.1 boot manifest 已不包含这三个 entry；当前正式图改为 `dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-conversation`、`dsh-client-ui-chat`、API controllers 等拆分包。插件的 bundle 只实际 `require('react')`，所以旧 inject 没阻止 Host 启动或资源生成，但它们已经不能正确表达激活依赖，必须更新。

两个业务 slot 没有被删除：`settings.section` 和 `conversation.chat.assistant-actions` 的官方 contract 均仍存在。由于当前环境没有可用的浏览器控制面，未能完成点击设置页和 action 的视觉验证；不能把静态存在夸大为完整 UI E2E 通过。

## Fresh-profile E2E 证据

测试环境：Windows、Node `24.18.0`、隔离 `DSH_HOME`、`@deepseek-ai/dsh@0.1.5-rc.1`、由当前干净源码打包的 `dsh-codex-migrate@2.0.0` tarball。

已验证：

1. 插件通过 `dsh plugin --profile web add <tarball>` 安装成功；安装器明确输出 peer dependency 警告。
2. `dsh web --host 127.0.0.1 --port 0 --no-open` 启动成功。
3. Web 首页返回 HTTP 200，标题为 DeepSeek Harness。
4. 生成的 boot manifest 包含 `dsh-codex-migrate/client.js`，说明客户端资源被发现并服务。
5. 插件 Host 已真实激活：`http://127.0.0.1:46371/health` 返回 `{"ok":true,"service":"dsh-codex-bridge"}`；隔离 DSH_HOME 下生成了 `codex-sync/config.json`、`diagnostics.json` 和 bridge 状态。
6. `diagnostics.json` 显示初始化成功且 `lastErrors` 为空。

未通过/未完成：

1. **Sync now 会话导入：接口级确定不兼容**，原因见上文 SessionHandle 对照；未对用户真实 Codex 历史执行破坏性导入。
2. 设置页、Remote `$mount()` 和 assistant action 的点击验证：浏览器控制面不可用，未执行视觉/UI 操作。
3. 重启测试第二次 Host 进程成功启动，但测试驱动终止首个 Windows PTY 后遗留 bridge listener，第二次插件报告 `EADDRINUSE 127.0.0.1:46371`。这不足以归因为 DSH 或插件正常关停缺陷，记录为测试基础设施残留，不作为产品回归结论。

补充：安装根包精确为 `dsh@0.1.5-rc.1`，但其 workspace 范围在本次真实解析中拉取了多项 `0.1.5-rc.2` 子包。这是 npm 实际安装图，而非本报告把 `next` 当作测试目标；后续可用锁文件固定完整依赖树以提高复现性。

## 发布建议

在修复前，应把支持上限停在已验证版本，并明确提示 npm latest 不受支持。最低修复集：

1. 将所有 persistence 操作收口到版本化 adapter，使用 `create/open` 获得 `SessionHandle`，通过 handle `append/flush/close`，并按 snapshots 读取 `list()`。
2. 更新 `dsh.client.inject` 到 0.1.5 的真实模块图，移除旧 runtime/web-react/ui-slots，并移除业务插件不应使用的 `immediately: true`。
3. 更新 DSH peer 范围，避免 `^0.1.0-rc.6` 造成 peer 警告或重复实例；`dsh-tools` 未被运行时代码 import，可评估删除。
4. 在固定完整锁文件的 fresh profile 中补跑设置页、Remote、单会话 Sync now、项目导入、重启后打开、归档/恢复和 assistant action。

## 实测回归与 2.0.2 修复

随后在 `0.1.5-rc.1` 上复测时发现两个独立问题：

1. `conversation.chat.assistant-actions` 在 0.1.5 的 owner 只传 `messageId`；会话 ID 必须由 session-scope 的 `inject(sessionId)` 注入。旧组件因此把空值当作会话 ID，点击“在 Codex 继续”会停在注册阶段。
2. Windows 上 Codex app-server 退出后临时导入目录可能短暂持有文件句柄；导入已成功但清理抛出 `EPERM`，被错误显示为失败。
3. 本机 Codex `sessions` 与 `archived_sessions` 共约 875 个 JSONL、约 3.7GB；清单扫描若读取完整文件会阻塞 Host 事件循环。

`dsh-codex-migrate@2.0.2` 已分别加入 session injection、Windows 清理重试、读取会话头/工作区提示的有界扫描，以及完整 transcript 的异步读取。验证结果：`npm test` 61/61 通过；Codex app-server 单会话与项目导入探针通过；真实本机清单约 875 个文件首次扫描约 1.4 秒（缓存后只复用未变文件）；选定单个会话的完整同步约 1.5 秒；隔离 DSH persistence + Codex app-server 的“继续到 Codex”调用返回有效 Codex task ID。
