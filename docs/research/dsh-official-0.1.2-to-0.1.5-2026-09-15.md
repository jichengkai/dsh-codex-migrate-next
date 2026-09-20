# DSH 0.1.2 → 0.1.5 官方 API 演进及插件影响

更新时间：2026-09-15。本文只使用 DeepSeek 官方仓库、Release、tag 源码与 npm 元数据，并针对 `dsh-codex-migrate@2.0.0` 当前代码评估。

## 先澄清版本序列

官方可核验的发布序列并不是四个连续稳定版：

1. `dsh-v0.1.2-rc.1`；
2. `dsh-v0.1.3-alpha.1`；
3. `dsh-v0.1.3-alpha.2`；
4. 随后直接进入 `dsh-v0.1.5-alpha.1/alpha.2/rc.1`。

官方 Releases 与 npm `@deepseek-ai/dsh` 版本历史中没有 `0.1.3` stable/rc，也没有 DSH `0.1.4` Release。因此下文的“0.1.3”指两次 alpha；“0.1.4”只能记为**没有独立发布证据的跳号区间**，不能虚构一个 API 基线。[官方 Releases](https://github.com/deepseek-ai/deepseek-harness/releases)、[npm 版本历史](https://www.npmjs.com/package/@deepseek-ai/dsh?activeTab=versions)

## 结论

对本插件的决定性破坏发生在 `0.1.3-alpha.1`，并延续到 npm latest `0.1.5-rc.1`：Session persistence 从“service 直接读写”改为“生命周期持有的 `SessionHandle`”。当前插件仍调用旧 service 级 `append/load/inspect`，并按旧返回结构使用 `create/list`，所以会话导入、读取验证与部分项目枚举必须重写 adapter。

其余主线：

- `dsh.bundle.patch` 与 Profile patch 没有移除；
- `dsh.client` 模块机制没有移除，但 0.1.2 已开始大幅拆包，插件当前 inject 列表到 0.1.5 已明显陈旧；
- Typert Remote 的 `TypertRemoteService`、`@Remote`、`ctx.remote`、`$mount()` 仍是官方模式；
- 当前插件使用的 `WorkspaceRegistry` 方法在 0.1.5 仍存在；
- `settings.section` 和 `conversation.chat.assistant-actions` 在 0.1.5 仍存在；0.1.5 Release 所说的 `conversation` panel 迁移不是 assistant message action 子槽被删除。

## 按版本演进

### 0.1.2-rc.1：客户端拆层后的基线

`0.1.2-rc.1` 汇总了自 `0.1.1-rc.2` 起的大规模 Web/Session 重构。与本插件相关的基线事实：

- `dsh.bundle.patch` 仍负责把插件 patch 插入 profile；未声明 bundle 的包不会自动激活。[0.1.2 发布文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.2-rc.1/docs/user/develop/basic/publish.md)
- 客户端已拆成 `ui-renderer`、`ui-session`、`ui-conversation`、`ui-chat`、API controller 等包；旧的 `dsh-client-web-react` 不再是当前依赖图核心。
- 客户端 `Session.events` 已被 `seq`、`eventAt()`、`snapshotEvents()` 替代。当前插件没有直接读取客户端 `Session.events`，因此此项没有直接击中代码。[0.1.2-rc.1 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-rc.1)
- Session persistence 仍是旧 service 模型：
  - `create(header): Promise<void>`；
  - `append(id, events): Promise<void>`；
  - `load(id)` / `inspect(id)`；
  - `list(): Promise<SessionHeader[]>` 一类 header 列表语义。[0.1.2-rc.1 persistence 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.2-rc.1/packages/session/session-persistence/src/index.ts)

当前插件在 `lib/logic.js` 中正是按这套签名实现。因此 0.1.2-rc.1 是旧 persistence adapter 的最后一个已核验基线。但插件 package peers 仍写 `^0.1.0-rc.6`，client inject 仍列 `dsh-client-runtime`、`dsh-client-web-react`，所以即便业务代码接近该基线，发布元数据也没有完整适配。

### 0.1.3-alpha.1：SessionHandle 破坏点

官方明确标为 breaking：

- persistence 由 lifecycle-scoped `SessionHandle` 持有；
- `agentLoop.create()` 改为异步；
- 每个 Session 新增单进程持有锁；
- Session format 升为 V2，并使用相邻 generation 迁移。[0.1.3-alpha.1 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.1)

核心签名变化：

```text
旧：sessionPersistence.create(header) -> Promise<void>
新：sessionPersistence.create(header, options?) -> Promise<SessionHandle>

旧：sessionPersistence.append(id, events)
新：handle.append(events, options?)

旧：sessionPersistence.load(id) / inspect(id)
新：sessionPersistence.open(id, 'read' | 'write', options?) -> Promise<SessionHandle>

旧：sessionPersistence.list() -> headers
新：sessionPersistence.list(options?) -> SessionPersistenceSnapshot[]
```

`SessionHandle` 还承担 flush/释放与访问模式的生命周期责任；不能只把 `append(id, events)` 机械改成另一个函数名。[0.1.3-alpha.1 persistence 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.3-alpha.1/packages/session/session-persistence/src/index.ts)

对当前插件的具体影响：

- `importConversationToDsh()` 与批量导入首先检查 `persistence.append`，在新 API 下会直接认为服务不可用并跳过；
- 已有会话的 `load/inspect` 回退链失效；
- `list()` 返回 snapshot 后，当前按 header 直接取 `id/cwd` 的代码会读错层级；
- 新建会话忽略 `create()` 返回的 handle，导致无法写入、flush 和释放锁；
- 重启、异常和并发导入必须验证 handle 正确关闭，否则可能制造锁占用。

### 0.1.3-alpha.2：性能与周边修复，不撤销 Handle

alpha.2 修复 Web 断线恢复、长会话性能和 Windows 进程清理，并调整 persona、subprocess 等接口；没有恢复旧 persistence service API。[0.1.3-alpha.2 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.3-alpha.2)

这些变化对插件不是新的主阻断；插件没有使用 persona 常量或普通 subprocess pid。但长会话/断线改进意味着适配后的 Remote 与 UI 回归应覆盖重连。

### 0.1.4：无独立官方发布

官方 DSH Release/tag 时间线上没有 `dsh-v0.1.4*`。不能把 master 某段提交历史命名为“0.1.4 API”。从可发布兼容矩阵看，应直接记录：

```text
0.1.2-rc.1 -> 0.1.3-alpha.1/alpha.2 -> 0.1.5-alpha.1/alpha.2/rc.1
```

这也意味着插件不应声明类似 `>=0.1.4` 的支持范围来暗示存在已测试的 0.1.4 产品版本。

### 0.1.5-alpha.1/alpha.2 → 0.1.5-rc.1：Session V3 与 Web panel 调整

0.1.5 继续保留 SessionHandle，并新增/汇总：

- Session format V3；历史日志通过新文件迁移，保留原始文件，不支持降级读取；自定义日志读取器必须适配；
- 移除 `ctx.agent`，调用方必须显式传 Agent；当前插件不访问 `ctx.agent`，没有直接影响；
- Web 全局 panel 改由 `sidebar.panellist` 与 `main` 注册，原顶层 `conversation` panel 移为 `main` 下 `conversation` key；
- 文件上传、右侧 Sidebar、交付物预览等 UI 能力加入；
- persistence 仍为 `create/open -> SessionHandle`、snapshot `list()` 模型。[0.1.5-alpha.1 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.1)、[0.1.5-alpha.2 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-alpha.2)、[0.1.5-rc.1 Release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.1)、[0.1.5-rc.1 persistence 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/packages/session/session-persistence/src/index.ts)

本插件不注册全局 `conversation` panel，而是注册 `conversation.chat.assistant-actions`，所以 panel API 迁移不能被误判为该 action slot 删除。当前官方 feedback 功能仍使用相同 action slot。[assistant-actions contract](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/contract/slots.ts)、[官方 feedback 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/feedback.md)

## 0.1.5-rc.1 当前接口逐项核对

### Bundle 和 client modules

`package.json#dsh.bundle.patch` 仍有效。`dsh.client` 仍解析：

- `platform`；
- `inject`；
- `immediately`；
- 新增可选 `external`。

Client 插件仍需 `platform: "web"` 并导出 `./client`。[0.1.5 发布文档](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.1/docs/user/develop/basic/publish.md)、[0.1.5 client modules 源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.1/packages/client/modules/src/index.ts)

当前 manifest 中这三项已不在 0.1.5 Web boot entries：

- `@deepseek-ai/dsh-client-runtime`；
- `@deepseek-ai/dsh-client-web-react`；
- `@deepseek-ai/dsh-client-ui-slots`。

实际新图包含 `dsh-client-ui-renderer/session/conversation/chat` 与 session/workspace controllers。旧 inject 不一定阻止资源被服务，但已不能表达真实激活顺序，必须更新；`immediately: true` 也不适合业务插件。

### Typert Remote

当前插件的 `TypertRemoteService`、手动 `Remote(method)` marker、客户端 `ctx.remote.$mount()` 路线仍成立。官方推荐生成 `./typert` / `./remote` 契约，本插件手写描述符仍有漂移风险，但此次版本线没有删除 Typert Remote。[API Gateway](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)

### WorkspaceRegistry

0.1.5 的公开声明仍包含当前插件使用的：

```ts
create(path: string, title?: string): Promise<Workspace>
list(): Workspace[]
resolveByPath(path: string): Promise<Workspace | undefined>
get archivedSessionIds(): readonly SessionId[]
archiveSession(sessionId: SessionId): Promise<void>
```

所以 WorkspaceRegistry 本身静态兼容。需要注意它内部已按 snapshot 读取新版 persistence；插件自己的 fallback 枚举仍按旧 persistence.list 语义，需要单独修复。[0.1.5 workspace 源码](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/packages/workspace/workspace/src/index.ts)

### UI slots

- `settings.section` 仍是 settings root/list slot；[tagged contract](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/packages/client/ui-settings/src/client/contract/slots.ts)
- `conversation.chat.assistant-actions` 仍存在，props 以 `messageId` 为关键上下文；[当前 contract](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/contract/slots.ts)

当前插件注册方式在名称层面仍正确，但要在更新 inject 后做真实浏览器验证。

### Node

0.1.2-rc.1 与 0.1.5-rc.1 根包要求均为 `^22.19.0 || >=24.0.0`，这条线没有再次抬升。[0.1.2 root package](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.2-rc.1/package.json)、[0.1.5 root package](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/dsh-v0.1.5-rc.1/package.json)

## 实现影响清单

必须修改：

1. 新建 persistence adapter，按 capability/版本选择旧 service 或新 `SessionHandle` 路径；若只支持 npm latest，可直接以 Handle 为主。
2. `create()` 后保存 handle，通过 `handle.append()` 写入并在成功/失败路径 flush、释放。
3. 用 `open(id, 'read')`/snapshot 能力替换 `load/inspect`；按 `snapshot.header` 读取 `list()`。
4. 更新 client inject 到 0.1.5 的实际 owning packages，移除旧 runtime/web-react/ui-slots 和 `immediately: true`。
5. 更新 `dsh-home-paths`、`dsh-typert-protocol` peers；评估删除运行时未 import 的 `dsh-tools` peer，避免 profile 双实例。

无需因本版本线修改：

- `dsh.bundle.patch` 外壳；
- Typert Remote 总体架构；
- `WorkspaceRegistry.create/list/resolveByPath/archiveSession/archivedSessionIds`；
- 两个 slot 的名称；
- `ctx.agent`（插件未使用）；
- 全局 panel API（插件未注册该 surface）。

## 建议兼容矩阵

| DSH 发布线 | 当前插件 2.0.0 | 修复后策略 |
|---|---|---|
| `0.1.2-rc.1` | 元数据未完整适配；旧 persistence 逻辑接近可用 | 若需保留，adapter 提供 legacy 分支 |
| `0.1.3-alpha.1/alpha.2` | Session 导入不兼容 | 不建议作为正式支持目标 |
| `0.1.4` | 官方无独立发布 | 不列入矩阵 |
| npm latest `0.1.5-rc.1` | Host 可加载，但核心 Session 导入确定不兼容 | 作为首要支持目标，改用 SessionHandle |

> 注：上面的判定和矩阵记录的是修复前 `2.0.0` 快照；下面的复测针对当前工作树的 `2.0.1` 兼容性修复。

## 实现后验证（2026-09-15）

- 本机 npm 安装版本：`@deepseek-ai/dsh@0.1.5-rc.1`（其 Session persistence 解析包为 `0.1.5-rc.2`）。
- 在独立 DSH profile 中安装本插件的 `2.0.1` 打包产物，使用一份包含 user、tool call/result、assistant 的 Codex JSONL fixture 执行 `codexSync/syncNow`：`scanned=1`、`imported=1`、`dsh.failed=0`、`attached=1`。
- 从实际 `session.v3.jsonl.zstd` 的连续 Zstandard frames 解码出 12 条事件，`seq=0..11` 连续；官方 `restoreReleasedV3Artifact` 校验通过。事件类型覆盖 `turn/start`、`user/message`、`step/start/end`、`assistant/message`、`tool/call`、`tool/result`、`turn/end`、`session/title`。
- 这证明适配不是仅对 fake service 的单元测试；新 DSH 的真实 `create → handle.append → flush → close` 路径已接受本插件生成的 V3 日志。

## 2.0.2 实测回归补充

- 0.1.5 的 `conversation.chat.assistant-actions` owner 只提供 `messageId`；2.0.2 通过 `inject(sessionId)` 补回 session scope，修复“在 Codex 继续”拿不到 DSH 会话的问题。
- Codex app-server 探针在 Windows 上由清理 `EPERM` 改为成功退出；单会话和项目导入均返回有效 task ID。
- 本机约 875 个 Codex JSONL 的首次清单扫描使用会话头/工作区提示有界读取，实测约 1.4 秒，避免把 3.7GB 历史全部读入 Host。
