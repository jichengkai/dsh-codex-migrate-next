import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { canonicalProjectKey, createLogic, NO_PROJECT } from '../lib/logic.js'

test('project-less Codex conversations use one canonical picker key and a visible DSH workspace', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'codex-unprojected-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const codexDir = join(root, '.codex')
  const outputDir = join(root, 'out')
  const sessionsDir = join(codexDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(join(sessionsDir, 'conversation.jsonl'), [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-08-26T00:00:00Z', payload: { id: 'unprojected-1', cwd: '' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '没有项目的对话' }] } }),
  ].join('\n'))
  const created = []
  const persistence = {
    async create(value) { created.push(value) },
    async append() {},
    async load() { return { state: { cursor: 1 } } },
  }
  const workspace = { async attachSession() {} }
  const workspaceRegistry = {
    async resolveByPath() { return workspace },
    archivedSessionIds: [],
  }
  const ctx = { get: (name) => ({ sessionPersistence: persistence, workspaceRegistry }[name]), interval: () => () => {}, timeout: () => {} }
  const logic = createLogic(ctx, {
    codexDir, outputDir, bridgeEnabled: false, projectMode: 'selected', selectedProjects: [NO_PROJECT], sessionMode: 'all',
    includeMcp: false, includeMemories: false, includeMcpMemories: false, includeMemorySkill: false, includeAgentsMd: false,
  }, root)
  await logic.init()
  await logic.syncNow({ trigger: 'test' })
  const inventory = await logic.listInventory()

  assert.equal(canonicalProjectKey(''), NO_PROJECT)
  assert.equal(inventory.projects.some((project) => project.key === NO_PROJECT), true)
  assert.equal(created.length, 1)
  assert.equal(created[0].cwd, join(outputDir, 'codex-unprojected'))
})

test('Codex imports target the DSH Session V3 handle contract and lifecycle', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-v3-import-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const codexDir = join(root, '.codex')
  const outputDir = join(root, 'out')
  const sessionsDir = join(codexDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(join(sessionsDir, 'conversation.jsonl'), [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-08-26T01:00:00Z', payload: { id: 'codex-v3', cwd: 'D:\\project-a' } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'user-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: '请检查项目' }] } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'tool-1', type: 'function_call', name: 'inspect', call_id: 'call-1', arguments: '{"scope":"src"}' } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'assistant-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已检查。' }] } }),
  ].join('\n'))

  const records = new Map()
  const opened = []
  const makeHandle = (id, access) => {
    const record = records.get(id)
    let closed = false
    return {
      id,
      header: record.header,
      access,
      async read() {
        assert.equal(closed, false)
        return { eventState: 'detached', events: record.events.slice() }
      },
      async append(events) {
        assert.equal(access, 'write')
        assert.equal(closed, false)
        record.events.push(...events)
      },
      async flush() { assert.equal(access, 'write') },
      async close() { closed = true },
    }
  }
  const persistence = {
    async create(header) {
      if (records.has(header.id)) throw new Error(`session "${header.id}" already exists`)
      records.set(header.id, { header: { ...header }, events: [] })
      return makeHandle(header.id, 'write')
    },
    async open(id, access) {
      opened.push([id, access])
      return makeHandle(id, access)
    },
    async list() {
      return Array.from(records.values(), (record) => ({ header: record.header, eventCount: record.events.length }))
    },
  }
  const ctx = { get: (name) => ({ sessionPersistence: persistence }[name]), interval: () => () => {}, timeout: () => {} }
  const logic = createLogic(ctx, {
    codexDir,
    outputDir,
    bridgeEnabled: false,
    projectMode: 'all',
    sessionMode: 'all',
    includeMcp: false,
    includeMemories: false,
    includeMcpMemories: false,
    includeMemorySkill: false,
    includeAgentsMd: false,
  }, root)
  await logic.init()
  await logic.syncNow({ trigger: 'test' })
  const result = logic.getState().status.lastSyncResult

  assert.equal(result.dsh.imported, 1)
  assert.equal(records.size, 1)
  const record = records.values().next().value
  assert.equal(record.header.version, 3)
  assert.equal(record.header.isSeeded, false)
  assert.equal(record.header.delegationDepth, 0)
  assert.equal(typeof record.header.createdAt, 'number')
  assert.equal(opened.length, 0)
  assert.deepEqual(record.events.map((event) => event.seq), Array.from({ length: record.events.length }, (_, index) => index))
  assert.deepEqual(record.events.filter((event) => event.type === 'turn/start').map((event) => event.data.turn), [1])
  assert.deepEqual(record.events.filter((event) => event.type === 'turn/end').map((event) => event.data.turn), [1])
  assert.equal(record.events.some((event) => event.type === 'step/start'), true)
  assert.equal(record.events.some((event) => event.type === 'step/end'), true)
  for (const event of record.events) {
    if (['user/message', 'assistant/message', 'tool/result'].includes(event.type)) assert.equal(event.surfaceOp, 'append')
    if (event.type === 'assistant/message') assert.deepEqual(event.data.stream, [])
  }
})

test('a DSH project imports every active conversation through the structured Codex adapter', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-project-import-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const created = []
  const batches = []
  const events = (id) => [
    { type: 'user/message', seq: 0, time: 1, data: { id: `${id}-u`, source: { kind: 'user' }, content: [{ type: 'text', text: `问题 ${id}` }] } },
    { type: 'assistant/message', seq: 1, time: 2, data: { message: { id: `${id}-a`, content: [{ type: 'text', text: `回答 ${id}` }] } } },
    { type: 'session/title', seq: 2, time: 3, data: { title: `对话 ${id}` } },
  ]
  const services = {
    sessionPersistence: { async inspect(id) { return { meta: { cwd: 'D:\\project-a' }, events: events(id) } } },
    workspaceRegistry: {
      archivedSessionIds: ['archived'],
      list() { return [{ record: { id: 'workspace-a', cwd: 'D:\\project-a', title: 'Project A', sessionIds: ['dsh-1', 'archived', 'dsh-2'] } }] },
    },
    codexConversationAdapter: {
      side: 'codex',
      async createCounterpart(seed) { created.push(seed); return { conversationId: `codex-${created.length}`, openUrl: `codex://threads/codex-${created.length}` } },
      async createProjectCounterparts(seed) {
        batches.push(seed)
        return seed.sessions.map((session, index) => ({
          dshConversationId: session.dshConversationId,
          conversationId: `codex-project-${index + 1}`,
          projectId: null,
          openUrl: `codex://threads/codex-project-${index + 1}`,
        }))
      },
    },
  }
  const ctx = { get: (name) => services[name], interval: () => () => {}, timeout: () => {} }
  const logic = createLogic(ctx, { outputDir: join(root, 'out'), bridgeEnabled: false }, root)
  await logic.init()
  const result = await logic.importDshProjectToCodex({ projectKey: 'workspace-a' })

  assert.equal(result.total, 2)
  assert.equal(result.imported.length, 2)
  assert.equal(result.failures.length, 0)
  assert.equal(created.length, 0)
  assert.equal(batches.length, 1)
  assert.equal(batches[0].workspace, 'D:\\project-a')
  assert.equal(batches[0].title, 'Project A')
  assert.deepEqual(batches[0].sessions.map((session) => session.dshConversationId), ['dsh-1', 'dsh-2'])
  assert.deepEqual(batches[0].sessions.map((session) => session.title), ['对话 dsh-1', '对话 dsh-2'])
  assert.deepEqual(result.imported.map((session) => session.projectKey), ['D:\\project-a', 'D:\\project-a'])
  assert.deepEqual(result.imported.map((session) => session.codexConversationId), ['codex-project-1', 'codex-project-2'])
  assert.deepEqual(result.imported.map((session) => session.codexProjectId), [null, null])
})
