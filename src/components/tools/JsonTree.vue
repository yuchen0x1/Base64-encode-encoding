<template>
  <div :class="['json-tree-node', depth === 0 ? 'root' : '']">
    <div class="json-tree-row" :style="{ paddingLeft: `${Math.min(depth, 12) * 14}px` }">
      <button
        v-if="isContainer"
        type="button"
        class="tree-toggle"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? '折叠' : '展开'} ${path}`"
        @click="expanded = !expanded"
      >
        {{ expanded ? '▾' : '▸' }}
      </button>
      <span v-else class="tree-toggle-spacer"></span>
      <span class="tree-key code-font">{{ label }}</span>
      <span class="tree-colon">:</span>
      <span :class="['tree-type', valueType]">{{ summary }}</span>
      <span class="tree-actions">
        <button type="button" class="tree-action" :title="`复制路径 ${path}`" @click="copyPath">路径</button>
        <button type="button" class="tree-action" :title="`复制节点 ${path}`" @click="copyValue">值</button>
      </span>
    </div>

    <div v-if="isContainer && expanded" class="json-tree-children">
      <JsonTree
        v-for="entry in visibleEntries"
        :key="entry.key"
        :node="entry.value"
        :label="entry.label"
        :path="entry.path"
        :depth="depth + 1"
        :default-expand-depth="defaultExpandDepth"
      />
      <div v-if="hiddenCount > 0" class="tree-truncated" :style="{ paddingLeft: `${Math.min(depth + 1, 12) * 14 + 20}px` }">
        还有 {{ hiddenCount }} 项未渲染；请在文本/路径模式处理超大集合。
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { copyText } from '../../utils/clipboard.js'
import { globalToast } from '../../composables/useToast.js'
import { formatJsonPathPart } from '../../utils/jsonPath.js'
import { formatJsonValuePreview } from './jsonTool.js'

defineOptions({ name: 'JsonTree' })

const MAX_VISIBLE_CHILDREN = 500

const props = defineProps({
  node: { type: [Object, Array, String, Number, Boolean], default: null },
  label: { type: String, default: '$' },
  path: { type: String, default: '$' },
  depth: { type: Number, default: 0 },
  defaultExpandDepth: { type: Number, default: 1 }
})

const expanded = ref(props.depth < props.defaultExpandDepth)
const isArray = computed(() => Array.isArray(props.node))
const isObject = computed(() => props.node !== null && typeof props.node === 'object' && !isArray.value)
const isContainer = computed(() => isArray.value || isObject.value)
const valueType = computed(() => {
  if (isArray.value) return 'array'
  if (isObject.value) return 'object'
  if (props.node === null) return 'null'
  return typeof props.node
})
const summary = computed(() => {
  if (isArray.value) return `Array(${props.node.length})`
  if (isObject.value) return `Object(${Object.keys(props.node).length})`
  if (typeof props.node === 'string') return formatJsonValuePreview(props.node, 120)
  if (props.node === null) return 'null'
  return String(props.node)
})

const entries = computed(() => {
  if (isArray.value) {
    return props.node.map((value, index) => ({
      key: `index-${index}`,
      label: `[${index}]`,
      value,
      path: `${props.path}[${index}]`
    }))
  }
  if (!isObject.value) return []
  return Object.keys(props.node).map(key => ({
    key: `key-${key}`,
    label: key,
    value: props.node[key],
    path: `${props.path}${formatJsonPathPart(key)}`
  }))
})
const visibleEntries = computed(() => entries.value.slice(0, MAX_VISIBLE_CHILDREN))
const hiddenCount = computed(() => Math.max(0, entries.value.length - MAX_VISIBLE_CHILDREN))

async function copyPath() {
  if (await copyText(props.path)) globalToast(`已复制路径：${props.path}`)
}

async function copyValue() {
  const serialized = typeof props.node === 'string'
    ? props.node
    : isContainer.value
      ? JSON.stringify(props.node, null, 2)
      : String(props.node)
  if (await copyText(serialized)) globalToast('已复制 JSON 节点值')
}
</script>

<style scoped>
.json-tree-node {
  font-size: 0.8rem;
}
.json-tree-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 28px;
  padding-right: 0.5rem;
  border-radius: 0.3rem;
}
.json-tree-row:hover {
  background: rgba(var(--rgb-primary), 0.06);
}
.tree-toggle,
.tree-toggle-spacer {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}
.tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--accent-cyan);
  cursor: pointer;
  font-size: 0.7rem;
}
.tree-key {
  color: var(--accent-purple);
  overflow-wrap: anywhere;
}
.tree-colon {
  color: var(--text-sub);
}
.tree-type {
  color: var(--text-muted);
  min-width: 0;
  overflow-wrap: anywhere;
}
.tree-type.string {
  color: var(--accent-green);
}
.tree-type.number {
  color: var(--accent-amber);
}
.tree-type.boolean {
  color: var(--accent-pink);
}
.tree-type.null {
  color: var(--text-sub);
  font-style: italic;
}
.tree-actions {
  margin-left: auto;
  display: flex;
  gap: 0.2rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.json-tree-row:hover .tree-actions,
.json-tree-row:focus-within .tree-actions {
  opacity: 1;
}
.tree-action {
  border: 1px solid var(--border-color);
  background: var(--surface-inset);
  color: var(--text-sub);
  border-radius: 3px;
  padding: 0.05rem 0.3rem;
  font-size: 0.62rem;
  cursor: pointer;
}
.tree-action:hover {
  color: var(--accent-cyan);
  border-color: rgba(var(--rgb-primary), 0.35);
}
.tree-truncated {
  font-size: 0.72rem;
  color: var(--text-sub);
  padding-top: 0.3rem;
  padding-bottom: 0.3rem;
}
</style>
