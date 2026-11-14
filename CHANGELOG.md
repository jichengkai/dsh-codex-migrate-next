# Changelog

## 2.0.5 — 2026-11-14

Maintained fork, published as `dsh-codex-migrate-next`, retargeted at DeepSeek Harness 0.2.x.

### Fixed

- The settings panel mounts its Remote namespace again: the hand-written Typert codec now provides the `create()` factory the Client registry requires, which previously aborted `$mount` and made every call fail with `remote.codexSync unavailable yet`.
- A failed Remote mount or state read is reported in the panel with its cause and a retry action, instead of an endless loading hint.
- The panel language follows the DSH UI locale by default (`language: auto`); locale ids with a region tag (`zh-CN`, `zh-Hans`) resolve to Chinese, and an existing stored `en` preference migrates once.

### Changed

- Session persistence targets the Session V4 contract: settlement `stream` and `turn`/`step` fields, `tool-call` blocks advertised before each `tool/call`, `tool`-role results, and interrupted Codex calls preserved as explicit failed results instead of dropped calls.
- `peerDependencies` and `engines.dsh` declare `>=0.2.2-rc.2`; npm `next`/`alpha` DSH channels remain unclaimed.
- Package renamed to `dsh-codex-migrate-next`; the Cordis row id follows the package name.
- Added `scripts/verify-import-against-dsh.mjs`, which migrates a synthetic Codex conversation and validates the result with the installed `Session.fromRestore`.

## 2.0.4 — 2026-09-23

Documentation and metadata release on top of 2.0.3; no migration behavior changes.

### Changed

- Include the DSH 0.1.5 compatibility and handoff-fix statement in the English and Chinese READMEs shipped on npm.
- Align the package, Codex companion, MCP server, and bridge client version metadata at 2.0.4.
- Keep the supported target explicit: npm `@deepseek-ai/dsh@0.1.5-rc.2` (`latest` on 2026-09-23); npm `next` and `alpha` are not claimed as supported.

## 2.0.3 — 2026-09-20

### Fixed

- Open imported Codex tasks through the host operating system after registration, so browsers that block `codex://` navigation no longer leave the user on an apparently stalled DSH action.
- Keep browser protocol navigation as a fallback and expose an explicit “Opened in Codex” action state after a successful handoff.

## 2.0.2 — 2026-09-15

Follow-up compatibility fix for the npm `@deepseek-ai/dsh` 0.1.5 release line.

### Fixed

- Fixed the DSH assistant action's session injection so “Continue in Codex” imports the active conversation instead of using the message id.
- Made Codex app-server temp-directory cleanup tolerant of short-lived Windows file locks after a successful import.
- Bounded metadata reads during inventory scans so large Codex histories do not block the DSH UI event loop.
- Read full transcripts asynchronously during selected/full sync so large migrations keep the Host responsive while they run.

## 2.0.1 — 2026-09-15

Compatibility patch for the npm `@deepseek-ai/dsh` 0.1.5 release line.

### Fixed

- Adapted Codex → DSH imports to the SessionHandle persistence API introduced in DSH 0.1.3, including explicit flush/close lifecycle and snapshot-shaped reads.
- Emit validated Session V3 headers and contiguous turn/step/message events, while preserving legacy service persistence as a compatibility fallback.
- Updated the web client injection graph and peer ranges to the modules shipped by DSH 0.1.5.

## 2.0.0 — 2026-08-28

Version 2.0 replaces the experimental shared-conversation architecture with explicit, predictable one-way structured imports. It also introduces the Codex companion MCP/Skill package, local MCP memory, native DSH → Codex actions, project batches, and a faster settings experience.

### Added

- Added one-shot structured migration in both directions:
  - Codex → DSH converts user messages, assistant replies, tool calls, and tool results into native DSH events.
  - DSH → Codex converts visible DSH history into Codex's supported external-agent session format.
- Added a native Codex action below every DSH assistant reply to import that conversation and open the resulting Codex task.
- Added **Batch Migration by Project / 按照项目批量迁移** for importing every unarchived DSH conversation in one native Codex batch while preserving the original workspace path.
- Added support for Codex conversations without a project through the canonical `(no project)` key and `codex-unprojected` DSH workspace.
- Added the bundled `dsh-codex-bridge` Codex MCP server and `continue-in-dsh` Skill.
- Added `continue_in_dsh`, which imports the current Codex task, opens DSH, and confirms with `已同步对话到 DSH。`.
- Added local **MCP Memory Beta** tools:
  - `remember_memory`
  - `search_memory`
  - `forget_memory`
- Added global, project, and conversation scopes for MCP memory, stored locally as an append-only JSONL journal.
- Added independent import switches for Codex Markdown memory, bridge MCP memory, and Memory Skill storage.
- Added an imported-conversation list in settings and direct navigation to imported counterparts.
- Added complete Windows PowerShell and macOS/Linux installation instructions for the DSH plugin, Codex MCP, and Skill.

### Changed

- Redesigned the Codex Migration settings page with cleaner cards, compact lists, native colors, rounded controls, and consistent dark/light styling.
- Fixed language switching so the active settings page updates immediately.
- Renamed the whole-project action to **Batch Migration by Project / 按照项目批量迁移** to match its actual behavior.
- Marked bridge MCP memory as **Beta** in the settings UI and documentation.
- Preserved only the latest assistant reply when a source turn was regenerated, matching the source conversation's visible state.
- Preserved native tool-call and tool-result relationships instead of flattening them into plain text.
- Excluded archived DSH sessions from project batches and excluded hidden reasoning/runtime snapshots from visible Codex imports.
- Left Codex sidebar organization to Codex; project batches share the original working directory but do not promise a synthetic sidebar project.

### Performance

- Added an incremental inventory cache keyed by file size, modification time, and content hash.
- Reuses unchanged parsed sessions and reparses only new or changed JSONL files on refresh.
- Removes deleted sessions from the cache and isolates corrupted files without discarding valid inventory.
- Avoids eagerly loading the full conversation inventory when the settings page opens.
- Replaced the repository banner with a smaller WebP asset.

### Security

- The handoff bridge binds only to `127.0.0.1`.
- Mutating bridge calls require a generated installation token.
- Request bodies are size-limited and unknown bridge methods are rejected.
- Disabling the DSH plugin stops the companion handoff service.
- MCP memories remain local by default.

### Removed

- Removed shared conversations and continuous bidirectional synchronization from the product surface.
- Removed writer leases, heartbeat ownership, offline message replay, conflict selection, and automatic cross-side archive propagation.
- Removed the Codex inline monitor/status panel and UI injection experiments.
- Removed the promise to create or group tasks under a synthetic Codex sidebar project.

### Upgrading from 0.1.x

1. Update the DSH plugin and restart DSH.
2. Clone or update this repository locally.
3. Register `codex/dsh-codex-bridge/mcp/server.mjs` with `codex mcp add`.
4. Copy `codex/dsh-codex-bridge/skills/continue-in-dsh` to `~/.agents/skills/`.
5. Restart Codex and verify the server with `/mcp` and the Skill with `/skills`.

Existing one-way migration output remains usable. Experimental shared-state records are not resumed by v2.0.

## 0.1.3 — 2026-08-15

- Added npm/GitHub package links to the installation section.
- Centered and optimized the README banner.
- Kept the original Codex → DSH conversation, MCP configuration, memory, `AGENTS.md`, and optional project-file migration workflow.
