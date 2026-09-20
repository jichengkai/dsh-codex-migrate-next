import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('DSH client uses native slots and one-way conversation import', () => {
  assert.match(source, /conversation\.chat\.assistant-actions/)
  assert.match(source, /function ContinueInCodexAction\(\{ messageId, sessionId \}\)/)
  assert.match(source, /inject: \(sessionId\) => \(\{ sessionId \}\)/)
  assert.match(source, /importDshConversationToCodex/)
  assert.match(source, /imported\?\.opened !== true/)
  assert.match(source, /continuedInCodex: '已在 Codex 打开'/)
  assert.match(source, /importDshProjectToCodex/)
  assert.match(source, /importedConversations/)
  assert.doesNotMatch(source, /registerBridgeScope|resolveBridgeConflict|CloudIcon/)
  assert.doesNotMatch(source, /MutationObserver|querySelector\(|getBoundingClientRect/)
  assert.match(source, /dshProjects: '按照项目批量迁移'/)
  assert.match(source, /dshProjects: 'Batch Migration by Project'/)
})

test('DSH 0.1.5 client manifest names the owning UI modules', () => {
  const inject = manifest.dsh?.client?.inject || []
  assert.deepEqual(inject, [
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-chat',
    '@deepseek-ai/dsh-client-ui-settings',
  ])
  assert.equal(Object.hasOwn(manifest.dsh.client, 'immediately'), false)
  assert.equal(inject.some((name) => name.includes('dsh-client-runtime') || name.includes('dsh-client-web-react') || name.includes('dsh-client-ui-slots')), false)
})

test('Continue in Codex uses a single clean filled knot icon', () => {
  assert.match(source, /const CODEX_ICON_PATH = 'M22\.2819 9\.8211/)
  assert.match(source, /fill: currentColor/)
})

test('Codex to DSH handoff still uses native navigation without inline UI', () => {
  assert.match(source, /navigationRequestId/)
  assert.match(source, /ctx\.sessions\.open\(target\.dshConversationId\)/)
  assert.match(source, /acknowledgeBridgeNavigation/)
  assert.doesNotMatch(source, /cxs-modal|cxs-cloud|monitor_dsh_task/)
})

test('memory import exposes the three supported sources', () => {
  assert.match(source, /includeMemories/)
  assert.match(source, /includeMcpMemories/)
  assert.match(source, /includeMemorySkill/)
  assert.match(source, /t\('memoryMcp'\)[\s\S]*?'Beta'/)
})
