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
  APP_STATE_SCHEMA_VERSION,
  migratePersistedAppState,
  readPersistedAppState,
  filterCommonTools,
  getCommonToolsCount,
  MAX_WORKSPACE_BACKUP_BYTES,
  MAX_RECENT_TOOLS,
  createWorkspaceBackup,
  parseWorkspaceBackup,
  recordRecentTool,
  sortToolsByPreference
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
  it('migrates legacy preferences without discarding fields', () => {
    const migrated = migratePersistedAppState({
      isDark: false,
      favorites: ['base64'],
      openTabs: ['json-format'],
      currentToolId: 'json-format',
      locale: 'en-US'
    })

    expect(migrated).toMatchObject({
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      isDark: false,
      favorites: ['base64'],
      openTabs: ['json-format'],
      currentToolId: 'json-format',
      recentToolIds: [],
      locale: 'en-US'
    })
  })

  it('accepts schema version zero and rejects invalid explicit versions', () => {
    expect(migratePersistedAppState({ schemaVersion: 0, favorites: ['base64'] })).toMatchObject({
      schemaVersion: APP_STATE_SCHEMA_VERSION,
      favorites: ['base64'],
      recentToolIds: []
    })

    for (const schemaVersion of [null, '1', true, 1.5, -1, Number.MAX_SAFE_INTEGER, 99]) {
      const raw = JSON.stringify({ schemaVersion, favorites: ['base64'] })
      const result = readPersistedAppState({ getItem: () => raw }, 'state')
      expect(result, `schemaVersion=${String(schemaVersion)}`).toMatchObject({
        state: null,
        canSave: false
      })
    }
  })

  it('protects malformed and future-version data from overwrite', () => {
    for (const raw of [
      '{bad json',
      JSON.stringify({ schemaVersion: null, favorites: ['base64'] }),
      JSON.stringify({ schemaVersion: 99, favorites: ['base64'] })
    ]) {
      const storage = { getItem: () => raw }
      expect(readPersistedAppState(storage, 'state')).toMatchObject({
        state: null,
        canSave: false
      })
    }
    expect(() => migratePersistedAppState([])).toThrow('格式无效')
  })

  it('treats absent stored data as writable defaults', () => {
    expect(readPersistedAppState({ getItem: () => null }, 'state')).toEqual({
      state: null,
      canSave: true,
      error: null
    })
  })

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

  it('migrates, validates, deduplicates, and bounds recent tools', () => {
    const migrated = normalizeAppState({
      favorites: ['base64'],
      openTabs: ['base64'],
      currentToolId: 'base64',
      recentToolIds: ['aes-crypto', 'missing', 'aes-crypto', 'json-format']
    }, tools, registeredToolIds)

    expect(migrated.recentToolIds).toEqual(['aes-crypto', 'json-format'])
    expect(normalizeAppState({ openTabs: ['base64'] }, tools, registeredToolIds).recentToolIds).toEqual([])

    expect(recordRecentTool(['aes-crypto', 'base64'], 'json-format'))
      .toEqual(['json-format', 'aes-crypto', 'base64'])
    expect(recordRecentTool(['aes-crypto', 'base64'], 'base64'))
      .toEqual(['base64', 'aes-crypto'])

    let recent = []
    for (let index = 0; index < 12; index += 1) recent = recordRecentTool(recent, `tool-${index}`)
    expect(recent).toHaveLength(MAX_RECENT_TOOLS)
    expect(recent[0]).toBe('tool-11')
    expect(recent.at(-1)).toBe('tool-4')
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

  it('uses the command search aliases, normalization, and tokens', () => {
    const qrTool = {
      id: 'qrcode-generator',
      name: '二维码生成与识别',
      description: '离线二维码处理',
      tags: ['二维码'],
      isCommon: true
    }

    expect(filterCommonTools([qrTool], [], 'QR SCAN')).toEqual([qrTool])
    expect(filterCommonTools([qrTool], [], 'ＱＲ')).toEqual([qrTool])
    expect(getCommonToolsCount([qrTool], [], 'qr scan')).toBe(1)
    expect(filterCommonTools([qrTool], [], 'qr missing')).toEqual([])
  })

  it('pins favorites, then recent tools, without mutating the source list', () => {
    const source = [...registeredTools]
    const ordered = sortToolsByPreference(source, ['aes-crypto', 'base64'], ['json-format'])

    expect(ordered.map(tool => tool.id)).toEqual(['aes-crypto', 'base64', 'json-format'])
    expect(source.map(tool => tool.id)).toEqual(['base64', 'json-format', 'aes-crypto'])
  })
})

describe('workspace backup', () => {
  it('serializes portable workspace state without tool objects', () => {
    const backup = createWorkspaceBackup({
      isDark: false,
      favorites: ['aes-crypto'],
      recentToolIds: ['base64'],
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
        recentToolIds: ['base64'],
        openTabs: ['base64', 'aes-crypto'],
        currentToolId: 'aes-crypto'
      }
    })
  })

  it('validates and normalizes imported workspace state', () => {
    const backup = createWorkspaceBackup({
      isDark: true,
      favorites: ['aes-crypto', 'missing'],
      recentToolIds: ['base64', 'missing'],
      openTabs: ['json-format', 'json-format'],
      currentToolId: 'aes-crypto'
    })
    const state = parseWorkspaceBackup(backup, tools, registeredToolIds)

    expect(state.isDark).toBe(true)
    expect(state.favorites).toEqual(['aes-crypto'])
    expect(state.recentToolIds).toEqual(['base64'])
    expect(state.openTabs.map(tool => tool.id)).toEqual(['json-format', 'aes-crypto'])
    expect(state.currentToolId).toBe('aes-crypto')
  })

  it('rejects backups from another app or schema', () => {
    expect(() => parseWorkspaceBackup({ app: 'other', schemaVersion: 1 }, tools, registeredToolIds))
      .toThrow('工作区备份版本不受支持')
    expect(() => parseWorkspaceBackup('{bad json', tools, registeredToolIds))
      .toThrow('工作区备份不是有效的 JSON 文件')
  })

  it('rejects oversized JSON before parsing it', () => {
    expect(() => parseWorkspaceBackup('x'.repeat(MAX_WORKSPACE_BACKUP_BYTES + 1), tools, registeredToolIds))
      .toThrow('工作区备份超过 1 MiB 大小上限')
  })
})
