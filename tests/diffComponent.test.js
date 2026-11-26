import { afterEach, describe, expect, it } from 'vitest'
import { createRenderer, ssrContextKey } from 'vue'
import ToolDiff from '../src/components/tools/ToolDiff.vue'

const renderer = createRenderer({
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() {}, setElementText() {}, parentNode() {}, nextSibling() {},
  insert() {}, remove() {}, patchProp() {}
})
let app

afterEach(() => app?.unmount())

describe('text diff summary', () => {
  it.each([
    ['a\nb\n', 'a\n\nb\n', { added: 1, removed: 0 }],
    ['a\n\nb\n', 'a\nb\n', { added: 0, removed: 1 }],
    ['', '\n\n', { added: 2, removed: 0 }],
    ['old\n\n', 'new\n', { added: 1, removed: 2 }]
  ])('counts all changed lines in %j -> %j', (oldText, newText, expected) => {
    app = renderer.createApp({ ...ToolDiff, render: () => null })
    app.provide(ssrContextKey, { modules: new Set() })
    const state = app.mount({}).$.setupState
    state.oldText = oldText
    state.newText = newText
    expect(state.diffStats).toEqual(expected)
  })
})
