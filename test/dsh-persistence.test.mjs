import assert from 'node:assert/strict'
import test from 'node:test'
import { createDshPersistenceAdapter, SESSION_FORMAT_VERSION } from '../lib/dsh-persistence.js'

function modernService() {
  const records = new Map()
  const calls = []
  function handleFor(id, access) {
    const record = records.get(id)
    if (!record) throw new Error(`session "${id}" not found`)
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
        calls.push(['append', id, events])
        record.events.push(...events)
      },
      async flush() {
        assert.equal(access, 'write')
        assert.equal(closed, false)
        calls.push(['flush', id])
      },
      async close() {
        closed = true
        calls.push(['close', id, access])
      },
    }
  }
  return {
    calls,
    records,
    async create(header) {
      if (records.has(header.id)) throw new Error(`session "${header.id}" already exists`)
      records.set(header.id, { header: { ...header }, events: [] })
      calls.push(['create', header])
      return handleFor(header.id, 'write')
    },
    async open(id, access) {
      calls.push(['open', id, access])
      return handleFor(id, access)
    },
    async list() {
      return Array.from(records.values(), (record, index) => ({
        header: { ...record.header },
        revision: index + 1,
        eventCount: record.events.length,
      }))
    },
  }
}

test('modern SessionHandle persistence is adapted to the migration facade', async () => {
  const service = modernService()
  const adapter = createDshPersistenceAdapter(service)
  assert.equal(adapter.mode, 'handle')
  assert.equal(adapter.canRead, true)
  assert.equal(adapter.canList, true)
  assert.equal(adapter.canWrite, true)

  const handle = await adapter.create({ id: 'modern-1', version: 0, createdAt: 42, cwd: 'D:\\project' })
  assert.equal(handle.id, 'modern-1')
  assert.deepEqual(service.calls[0], ['create', {
    version: SESSION_FORMAT_VERSION,
    id: 'modern-1',
    createdAt: 42,
    isSeeded: false,
    delegationDepth: 0,
    cwd: 'D:\\project',
  }])

  const events = [{ type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }]
  await adapter.append('modern-1', events)
  assert.deepEqual(service.records.get('modern-1').events, events)
  assert.deepEqual(service.calls.slice(-2).map((entry) => entry[0]), ['flush', 'close'])

  const loaded = await adapter.load('modern-1')
  assert.deepEqual(loaded.events, events)
  assert.equal(loaded.header.version, SESSION_FORMAT_VERSION)
  assert.equal(loaded.state.cursor, 1)
  assert.equal(service.calls.at(-1)[0], 'close')

  const listed = await adapter.list()
  assert.deepEqual(listed, [{
    version: SESSION_FORMAT_VERSION,
    id: 'modern-1',
    createdAt: 42,
    isSeeded: false,
    delegationDepth: 0,
    cwd: 'D:\\project',
    revision: 1,
    eventCount: 1,
  }])
})

test('legacy service persistence remains readable and writable through the same facade', async () => {
  const calls = []
  const legacy = {
    async create(header) { calls.push(['create', header]) },
    async append(id, events) { calls.push(['append', id, events]) },
    async load(id) { calls.push(['load', id]); return { state: { cursor: 2 }, events: [] } },
    async list() { return [{ id: 'legacy-1', version: 0 }] },
  }
  const adapter = createDshPersistenceAdapter(legacy)
  assert.equal(adapter.mode, 'legacy')
  await adapter.create({ id: 'legacy-1', version: 0, createdAt: 7 })
  await adapter.append('legacy-1', [])
  assert.deepEqual(await adapter.inspect('legacy-1'), { state: { cursor: 2 }, events: [] })
  assert.deepEqual(await adapter.list(), [{ id: 'legacy-1', version: 0 }])
  assert.equal(calls[0][1].version, 0)
  assert.equal(calls[0][1].id, 'legacy-1')
})
