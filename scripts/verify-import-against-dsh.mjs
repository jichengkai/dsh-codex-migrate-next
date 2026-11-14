// End-to-end compatibility check: migrate one synthetic Codex conversation
// through the real import path, then hand the produced header + events to the
// installed DSH `Session.fromRestore` validator — the same code that rejects an
// unopenable session when the GUI seeds it.
//
// Usage:
//   DSH_INSTALL_DIR=/Applications/.../app.asar/dsh/node_modules/@deepseek-ai/dsh \
//     node scripts/verify-import-against-dsh.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLogic } from '../lib/logic.js'

if (process.env.DSH_INSTALL_DIR === undefined || process.env.DSH_INSTALL_DIR === '') {
  console.error('DSH_INSTALL_DIR is required')
  process.exit(2)
}
const { Session } = await import(
  pathToFileURL(join(process.env.DSH_INSTALL_DIR, '..', 'dsh-session', 'lib', 'index.js')).href
)

const root = mkdtempSync(join(tmpdir(), 'codex-import-e2e-'))
const cleanup = () => rmSync(root, { recursive: true, force: true })
try {
  const codexDir = join(root, '.codex')
  const outputDir = join(root, 'out')
  const sessionsDir = join(codexDir, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(join(sessionsDir, 'conversation.jsonl'), [
    JSON.stringify({ type: 'session_meta', timestamp: '2026-08-26T01:00:00Z', payload: { id: 'codex-e2e', cwd: 'D:\\project-a' } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'user-1', type: 'message', role: 'user', content: [{ type: 'input_text', text: '请检查项目' }] } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'tool-1', type: 'function_call', name: 'inspect', call_id: 'call-1', arguments: '{"scope":"src"}' } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'result-1', type: 'function_call_output', call_id: 'call-1', output: 'ok' } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'assistant-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已检查。' }] } }),
    JSON.stringify({ type: 'response_item', payload: { id: 'tool-2', type: 'function_call', name: 'unfinished', arguments: '{}' } }),
  ].join('\n'))

  const records = new Map()
  const makeHandle = (id, access) => {
    const record = records.get(id)
    let closed = false
    return {
      id,
      header: record.header,
      access,
      async read() { return { eventState: 'detached', events: record.events.slice() } },
      async append(events) { record.events.push(...events) },
      async flush() {},
      async close() { closed = true },
    }
  }
  const persistence = {
    async create(header) {
      records.set(header.id, { header: { ...header }, events: [] })
      return makeHandle(header.id, 'write')
    },
    async open(id, access) { return makeHandle(id, access) },
    async list() { return Array.from(records.values(), (r) => ({ header: r.header, eventCount: r.events.length })) },
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
  await logic.syncNow({ trigger: 'verify' })

  const result = logic.getState().status.lastSyncResult
  if (!result || result.dsh.imported !== 1) {
    console.error('FAIL: import did not produce exactly one DSH session:', JSON.stringify(result?.dsh))
    process.exitCode = 1
  } else {
    const record = records.values().next().value
    const settlements = record.events.filter((event) => event.type === 'assistant/message' || event.type === 'assistant/attempt')
    const missingStream = settlements.filter((event) => !Array.isArray(event.data?.stream))
    if (missingStream.length > 0) {
      console.error(`FAIL: ${missingStream.length}/${settlements.length} settlements lack data.stream`)
      process.exitCode = 1
    }
    try {
      Session.fromRestore(record.header.id, record.events, record.header, 0, 'detached', [])
      console.log(`PASS: DSH Session.fromRestore accepted the import (${record.events.length} events, ${settlements.length} settlements)`)
    } catch (error) {
      console.error('FAIL: DSH Session.fromRestore rejected the import:', error.message)
      process.exitCode = 1
    }
  }
} finally {
  cleanup()
}
