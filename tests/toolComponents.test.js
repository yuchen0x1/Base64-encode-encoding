import { describe, expect, it } from 'vitest'
import { compileScript, parse } from '@vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const componentDirectory = resolve(process.cwd(), 'src/components/tools')

function compileComponent(filename) {
  const source = readFileSync(resolve(componentDirectory, filename), 'utf8')
  const { descriptor, errors } = parse(source, { filename })
  expect(errors).toEqual([])
  expect(descriptor.scriptSetup).toBeTruthy()
  expect(() => compileScript(descriptor, { id: filename })).not.toThrow()
  return source
}

describe('tool component Vue compilation', () => {
  it('compiles the updated JSON, JWT, JWT generator and AES components', () => {
    for (const filename of ['ToolJson.vue', 'ToolJwt.vue', 'ToolJwtGenerator.vue', 'ToolAes.vue']) {
      expect(compileComponent(filename)).toContain('<script setup>')
    }
  })

  it('clears old JWT tokens and copied/error state when any signing input changes', () => {
    const source = compileComponent('ToolJwtGenerator.vue')
    expect(source).toMatch(/watch\(\[headerJson, payloadJson, secret, expirySeconds\]/)
    expect(source).toMatch(/generatedToken\.value = ''/)
    expect(source).toMatch(/copied\.value = false/)
    expect(source).toContain("import { signJwtHs256 } from './jwtGeneratorTool.js'")
  })

  it('exposes parse-only JWT status with a separate not-yet-valid state', () => {
    const component = compileComponent('ToolJwt.vue')
    const helper = readFileSync(resolve(componentDirectory, 'jwtTool.js'), 'utf8')
    expect(component).toContain('仅解析，不验签')
    expect(component).toContain('tokenStatus.notYetValid')
    expect(helper).toContain('尚未生效')
    expect(component).toContain("import { getJwtClaims, getJwtStatus, parseJwt } from './jwtTool.js'")
  })
})
