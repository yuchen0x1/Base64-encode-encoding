import { vi, describe, expect, it } from 'vitest'

vi.stubGlobal('__RELEASE_NOTES__', [])
vi.stubGlobal('__RELEASE_DATE__', '')
vi.stubGlobal('__APP_VERSION__', '0.0.0')
vi.stubGlobal('__BUILD_TIME__', '')
vi.mock('../src/config/registry.js', () => ({
  toolComponents: {},
  assertToolRegistry: () => true
}))

const {
  normalizeAppState,
  filterCommonTools,
  getCommonToolsCount,
  createWorkspaceBackup,
  parseWorkspaceBackup
} = await import('../src/utils/appState.js')

const tools = [
  { id: 'base64', name: 'Base64', description: 'Encode data', tags: ['encode'], isCommon: true },
  { id: 'json-format', name: 'JSON Formatter', description: 'Format JSON', tags: ['json'], isCommon: true },
  { id: 'aes-crypto', name: 'AES', description: 'Encrypt data', tags: ['crypto'], isCommon: false },
  { id: 'registry-orphan', name: 'Orphan', description: 'Not registered', tags: [], isCommon: true }
]
const registeredToolIds = ['base64', 'json-format', 'aes-crypto']
const registeredTools = tools.filter(tool => registeredToolIds.includes(tool.id))

describe('App state restoration', () => {
  it('preserves an explicitly empty favorites list', () => {
    const state = normalizeAppState({ favorites: [], openTabs: ['base64'], currentToolId: 'base64' }, tools, registeredToolIds)

    expect(state.favorites).toEqual([])
  })

  it('filters unknown and duplicate favorites and tabs', () => {
    const state = normalizeAppState({
      favorites: ['aes-crypto', 'missing', 'aes-crypto', 'registry-orphan'],
      openTabs: ['json-format', 'missing', 'json-format', 'base64'],
      currentToolId: 'json-format'
    }, tools, registeredToolIds)

    expect(state.favorites).toEqual(['aes-crypto'])
    expect(state.openTabs.map(tool => tool.id)).toEqual(['json-format', 'base64'])
  })

  it('restores current tool only when registered and includes it in open tabs', () => {
    const validCurrent = normalizeAppState({
      favorites: [],
      openTabs: ['base64'],
      currentToolId: 'aes-crypto'
    }, tools, registeredToolIds)
    const invalidCurrent = normalizeAppState({
      favorites: [],
      openTabs: ['json-format'],
      currentToolId: 'registry-orphan'
    }, tools, registeredToolIds)

    expect(validCurrent.currentToolId).toBe('aes-crypto')
    expect(validCurrent.openTabs.map(tool => tool.id)).toEqual(['base64', 'aes-crypto'])
    expect(invalidCurrent.currentToolId).toBe('json-format')
    expect(invalidCurrent.openTabs.map(tool => tool.id)).toContain(invalidCurrent.currentToolId)
  })

  it('falls back to valid defaults when stored tabs are empty or invalid', () => {
    const state = normalizeAppState({
      favorites: null,
      openTabs: ['missing'],
      currentToolId: 'missing'
    }, tools, registeredToolIds)

    expect(state.favorites).toEqual(['base64', 'json-format'])
    expect(state.openTabs.map(tool => tool.id)).toEqual(['base64', 'json-format'])
    expect(state.currentToolId).toBe('base64')
  })
})

describe('common tools', () => {
  it('returns the built-in and favorited union without duplicate tools', () => {
    const filteredTools = filterCommonTools(registeredTools, ['aes-crypto', 'base64', 'unknown'])

    expect(filteredTools.map(tool => tool.id)).toEqual(['base64', 'json-format', 'aes-crypto'])
    expect(getCommonToolsCount(registeredTools, ['aes-crypto', 'base64', 'unknown'])).toBe(filteredTools.length)
    expect(getCommonToolsCount(registeredTools, ['aes-crypto'], 'crypto')).toBe(1)
  })

  it('applies search to the same common-tools result set', () => {
    expect(filterCommonTools(tools, ['aes-crypto'], 'crypto').map(tool => tool.id)).toEqual(['aes-crypto'])
  })
})

describe('workspace backup', () => {
  it('serializes portable workspace state without tool objects', () => {
    const backup = createWorkspaceBackup({
      isDark: false,
      favorites: ['aes-crypto'],
      openTabs: [{ id: 'base64' }, { id: 'aes-crypto' }],
      currentToolId: 'aes-crypto'
    }, new Date('2026-11-12T00:00:00.000Z'))

    expect(backup).toEqual({
      app: 'geek-toolbox',
      schemaVersion: 1,
      exportedAt: '2026-11-12T00:00:00.000Z',
      state: {
        isDark: false,
        favorites: ['aes-crypto'],
        openTabs: ['base64', 'aes-crypto'],
        currentToolId: 'aes-crypto'
      }
    })
  })

  it('validates and normalizes imported workspace state', () => {
    const backup = createWorkspaceBackup({
      isDark: true,
      favorites: ['aes-crypto', 'missing'],
      openTabs: ['json-format', 'json-format'],
      currentToolId: 'aes-crypto'
    })
    const state = parseWorkspaceBackup(backup, tools, registeredToolIds)

    expect(state.isDark).toBe(true)
    expect(state.favorites).toEqual(['aes-crypto'])
    expect(state.openTabs.map(tool => tool.id)).toEqual(['json-format', 'aes-crypto'])
    expect(state.currentToolId).toBe('aes-crypto')
  })

  it('rejects backups from another app or schema', () => {
    expect(() => parseWorkspaceBackup({ app: 'other', schemaVersion: 1 }, tools, registeredToolIds))
      .toThrow('工作区备份版本不受支持')
    expect(() => parseWorkspaceBackup('{bad json', tools, registeredToolIds))
      .toThrow('工作区备份不是有效的 JSON 文件')
  })
})
