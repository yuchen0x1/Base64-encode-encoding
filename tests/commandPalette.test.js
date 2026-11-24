import { describe, expect, it } from 'vitest'
import {
  buildCommandCatalog,
  commandOptionId,
  filterCommands,
  flattenCommandCatalog,
  moveCommandIndex,
  scoreCommand
} from '../src/utils/commandPalette.js'

const tools = [
  { id: 'base64', name: 'Base64 编解码', category: 'encode', description: '文本 Base64 实时编码解码', tags: ['base64', 'encode'], icon: 'Binary', isCommon: true },
  { id: 'json-format', name: 'JSON 格式化', category: 'json', description: 'JSON 格式化校验', tags: ['json', 'format'], icon: 'FileCode2', isCommon: true },
  { id: 'jwt-decoder', name: 'JWT 解析', category: 'encode', description: '解析令牌', tags: ['jwt', 'token'], icon: 'ShieldCheck', isCommon: true },
  { id: 'aes-crypto', name: 'AES 对称加密', category: 'crypto', description: '本地加密调试', tags: ['aes', 'encrypt'], icon: 'Lock', isCommon: false }
]

const actions = [
  { id: 'toggle-theme', title: '切换深浅主题', subtitle: '外观', icon: 'Moon', keywords: ['dark', 'light'] }
]

describe('command palette catalog', () => {
  it('orders pinned, recent, actions, and remaining tools without duplicates', () => {
    const catalog = buildCommandCatalog({
      tools,
      favorites: ['base64', 'json-format'],
      recentToolIds: ['json-format', 'aes-crypto'],
      actions
    })
    const commands = flattenCommandCatalog(catalog)

    expect(commands.map(command => command.id)).toEqual([
      'tool:base64',
      'tool:json-format',
      'tool:aes-crypto',
      'action:toggle-theme',
      'tool:jwt-decoder'
    ])
    expect(catalog.tools.map(command => command.id)).toEqual(['tool:jwt-decoder'])
    expect(new Set(commands.map(command => command.id)).size).toBe(commands.length)
  })

  it('searches Chinese, English, descriptions, tags, and aliases', () => {
    const commands = flattenCommandCatalog(buildCommandCatalog({ tools, favorites: [], recentToolIds: [], actions }))

    expect(filterCommands(commands, 'base64')[0].toolId).toBe('base64')
    expect(filterCommands(commands, 'json 校验')[0].toolId).toBe('json-format')
    expect(filterCommands(commands, 'jwt verify')[0].toolId).toBe('jwt-decoder')
    expect(filterCommands(commands, '对称加密')[0].toolId).toBe('aes-crypto')
    expect(filterCommands(commands, 'dark')[0].type).toBe('action')
    expect(filterCommands(commands, 'zzzz-no-match')).toEqual([])
  })

  it('scores titles above tags and rewards pinned commands', () => {
    const regular = {
      id: 'tool:one', type: 'tool', title: 'Base64', subtitle: '', keywords: 'base64 encode',
      pinned: false, recentIndex: Number.MAX_SAFE_INTEGER, sectionKey: 'tools'
    }
    const tagged = { ...regular, id: 'tool:two', title: 'Other', keywords: 'base64 helper' }
    const pinned = { ...tagged, id: 'tool:three', pinned: true }

    expect(scoreCommand(regular, 'base64')).toBeGreaterThan(scoreCommand(tagged, 'base64'))
    expect(scoreCommand(pinned, 'base64')).toBeGreaterThan(scoreCommand(tagged, 'base64'))
  })

  it('returns a dedicated result group and stays empty for whitespace', () => {
    const commands = flattenCommandCatalog(buildCommandCatalog({ tools, favorites: [], recentToolIds: [], actions }))
    expect(filterCommands(commands, 'base64').every(command => command.sectionKey === 'results')).toBe(true)
    expect(filterCommands(commands, '   ')).toHaveLength(commands.length)
  })
})

describe('command palette keyboard helpers', () => {
  it('wraps navigation and handles empty lists', () => {
    expect(moveCommandIndex(0, -1, 3)).toBe(2)
    expect(moveCommandIndex(2, 1, 3)).toBe(0)
    expect(moveCommandIndex(-1, 1, 3)).toBe(0)
    expect(moveCommandIndex(-1, -1, 3)).toBe(2)
    expect(moveCommandIndex(0, 1, 0)).toBe(-1)
  })

  it('creates stable DOM ids for arbitrary command ids', () => {
    expect(commandOptionId('tool:base64')).toBe('command-option-tool-base64')
    expect(commandOptionId('action:切换 主题')).toMatch(/^command-option-[a-zA-Z0-9_-]+$/)
  })
})
