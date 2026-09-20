// Compatibility facade for the DSH session-persistence service.
//
// DSH 0.1.3 introduced lifecycle-scoped SessionHandle objects and 0.1.5
// made that contract the npm latest API.  The rest of this plugin still wants
// a small, request-scoped facade (`create`, `append`, `load`, `inspect`,
// `list`), so all ownership and snapshot conversion lives here instead of
// being spread through the migration logic.

const SESSION_FORMAT_VERSION = 3

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function isHandle(value) {
  return isObject(value)
    && typeof value.append === 'function'
    && typeof value.read === 'function'
    && typeof value.close === 'function'
}

function isModernService(service) {
  // The released handle API has no service-level append/load/inspect methods.
  // Keep the check deliberately structural so this facade also works with a
  // test double or a future backend that implements the same public seam.
  return isObject(service)
    && typeof service.create === 'function'
    && typeof service.open === 'function'
    && typeof service.list === 'function'
    && typeof service.append !== 'function'
}

function isLegacyWritableService(service) {
  return isObject(service)
    && typeof service.create === 'function'
    && typeof service.append === 'function'
}

function modernHeader(header) {
  const input = isObject(header) ? header : {}
  const id = String(input.id || '')
  if (id === '') throw new Error('DSH session header requires an id')
  const createdAt = Number.isSafeInteger(input.createdAt) && input.createdAt >= 0
    ? input.createdAt
    : Date.now()
  const out = {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt,
    isSeeded: input.isSeeded === true,
    // V3 keeps delegationDepth in the required header inventory.  A Codex
    // import is always a root session, so its canonical value is zero.
    delegationDepth: Number.isSafeInteger(input.delegationDepth) && input.delegationDepth >= 0
      ? input.delegationDepth
      : 0,
  }
  if (typeof input.cwd === 'string' && input.cwd !== '') out.cwd = input.cwd
  if (typeof input.parentSession === 'string' && input.parentSession !== '') out.parentSession = input.parentSession
  if (input.origin === 'subagent') out.origin = input.origin
  if (typeof input.agentPreset === 'string' && input.agentPreset !== '') out.agentPreset = input.agentPreset
  return out
}

function legacyHeader(header) {
  const input = isObject(header) ? header : {}
  const out = {
    version: input.version === undefined ? 0 : input.version,
    id: String(input.id || ''),
    createdAt: Number.isSafeInteger(input.createdAt) && input.createdAt >= 0 ? input.createdAt : Date.now(),
  }
  if (typeof input.cwd === 'string' && input.cwd !== '') out.cwd = input.cwd
  return out
}

async function closeHandle(handle) {
  if (isHandle(handle)) await handle.close()
}

async function readModern(service, id) {
  const handle = await service.open(String(id), 'read')
  if (!isHandle(handle)) throw new Error('DSH sessionPersistence.open() did not return a SessionHandle')
  try {
    const result = await handle.read()
    const events = Array.isArray(result?.events) ? Array.from(result.events) : []
    const meta = isObject(handle.header)
      ? handle.header
      : { id: String(id), version: SESSION_FORMAT_VERSION, createdAt: 0, isSeeded: false, delegationDepth: 0 }
    // Keep the legacy-shaped state fields for callers that only use the cursor
    // as an existence check.  The canonical source remains `events`.
    return {
      meta,
      header: meta,
      events,
      state: { cursor: events.length, events },
    }
  } finally {
    await closeHandle(handle)
  }
}

function normalizeSnapshot(snapshot) {
  const header = isObject(snapshot?.header) ? snapshot.header : snapshot
  if (!isObject(header)) return null
  const id = String(header.id || '')
  if (id === '') return null
  const out = { ...header, id }
  if (snapshot !== header) {
    if (snapshot.revision !== undefined) out.revision = snapshot.revision
    if (snapshot.eventCount !== undefined) out.eventCount = snapshot.eventCount
    if (snapshot.sizeBytes !== undefined) out.sizeBytes = snapshot.sizeBytes
  }
  return out
}

/**
 * Build a stable persistence facade around either the 0.1.2 service API or
 * the 0.1.5 SessionHandle API. Returns null when no persistence service is
 * mounted in the host context.
 */
export function createDshPersistenceAdapter(service) {
  if (!isObject(service)) return null
  const modern = isModernService(service)
  const legacyWritable = isLegacyWritableService(service)
  const canRead = modern || typeof service.inspect === 'function' || typeof service.load === 'function'
  const canList = modern || typeof service.list === 'function'
  const canWrite = modern || legacyWritable
  const pending = new Map()

  const adapter = {
    mode: modern ? 'handle' : legacyWritable ? 'legacy' : 'read-only',
    canRead,
    canList,
    canWrite,

    async create(header) {
      if (!canWrite) throw new Error('DSH session persistence is not writable')
      if (!modern) return service.create(legacyHeader(header))
      const normalized = modernHeader(header)
      const handle = await service.create(normalized)
      if (!isHandle(handle)) throw new Error('DSH sessionPersistence.create() did not return a SessionHandle')
      pending.set(normalized.id, handle)
      return handle
    },

    async append(id, events) {
      if (!canWrite) throw new Error('DSH session persistence is not writable')
      if (!modern) return service.append(id, events)
      const sessionId = String(id)
      let handle = pending.get(sessionId)
      const ownedHere = !isHandle(handle)
      if (ownedHere) {
        handle = await service.open(sessionId, 'write')
        if (!isHandle(handle)) throw new Error('DSH sessionPersistence.open() did not return a SessionHandle')
      }
      let failure
      try {
        await handle.append(Array.isArray(events) ? events : [])
        if (typeof handle.flush === 'function') await handle.flush()
      } catch (error) {
        failure = error
      }
      if (pending.get(sessionId) === handle) pending.delete(sessionId)
      try {
        await closeHandle(handle)
      } catch (closeError) {
        if (failure) throw new AggregateError([failure, closeError], `failed to persist DSH session "${sessionId}"`)
        throw closeError
      }
      if (failure) throw failure
    },

    async inspect(id) {
      if (!canRead) throw new Error('DSH session persistence is not readable')
      if (modern) return readModern(service, id)
      if (typeof service.inspect === 'function') return service.inspect(id)
      if (typeof service.load === 'function') return service.load(id)
      throw new Error('DSH session persistence cannot inspect conversations')
    },

    async load(id) {
      if (!canRead) throw new Error('DSH session persistence is not readable')
      if (modern) return readModern(service, id)
      if (typeof service.load === 'function') return service.load(id)
      if (typeof service.inspect === 'function') return service.inspect(id)
      throw new Error('DSH session persistence cannot load conversations')
    },

    async list() {
      if (!canList) return []
      const listed = await service.list()
      if (!modern) return Array.isArray(listed) ? listed : []
      return (Array.isArray(listed) ? listed : []).map(normalizeSnapshot).filter(Boolean)
    },
  }
  return Object.freeze(adapter)
}

export { SESSION_FORMAT_VERSION }
