<template>
  <div class="json-tree">
    <div
      v-for="entry in tree.rows"
      :key="entry.path"
      :class="['json-tree-node', entry.depth === 0 ? 'root' : '']"
    >
      <div class="json-tree-row" :style="{ paddingLeft: `${Math.min(entry.depth, 12) * 14}px` }">
        <button
          v-if="entry.isContainer"
          type="button"
          class="tree-toggle"
          :aria-expanded="entry.expanded"
          :aria-label="`${entry.expanded ? '折叠' : '展开'} ${entry.path}`"
          @click="toggleEntry(entry)"
        >
          {{ entry.expanded ? '▾' : '▸' }}
        </button>
        <span v-else class="tree-toggle-spacer"></span>
        <span class="tree-key code-font">{{ entry.label }}</span>
        <span class="tree-colon">:</span>
        <span :class="['tree-type', valueType(entry.node)]">{{ summary(entry.node) }}</span>
        <span class="tree-actions">
          <button type="button" class="tree-action" :title="`复制路径 ${entry.path}`" @click="copyPath(entry.path)">路径</button>
          <button type="button" class="tree-action" :title="`复制节点 ${entry.path}`" @click="copyValue(entry.node)">值</button>
        </span>
      </div>
    </div>
    <div v-if="tree.truncated" class="tree-truncated">
      树视图最多显示 {{ JSON_TREE_MAX_VISIBLE_NODES }} 个节点；其余项未加载，请使用 JSONPath 查询或编辑器文本模式。
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { copyText } from '../../utils/clipboard.js'
import { globalToast } from '../../composables/useToast.js'
import { buildJsonTreeRows, JSON_TREE_MAX_VISIBLE_NODES } from '../../utils/jsonTree.js'
import { formatJsonValuePreview } from './jsonTool.js'

defineOptions({ name: 'JsonTree' })

const props = defineProps({
  node: { type: [Object, Array, String, Number, Boolean], default: null },
  defaultExpandDepth: { type: Number, default: 1 }
})

const expandedOverrides = ref(new Map())
const tree = computed(() => buildJsonTreeRows(props.node, {
  defaultExpandDepth: props.defaultExpandDepth,
  expandedOverrides: expandedOverrides.value
}))

function toggleEntry(entry) {
  const next = new Map(expandedOverrides.value)
  next.set(entry.path, !entry.expanded)
  expandedOverrides.value = next
}

function valueType(node) {
  if (Array.isArray(node)) return 'array'
  if (node !== null && typeof node === 'object') return 'object'
  if (node === null) return 'null'
  return typeof node
}

function summary(node) {
  if (Array.isArray(node)) return `Array(${node.length})`
  if (node !== null && typeof node === 'object') return 'Object'
  if (typeof node === 'string') return formatJsonValuePreview(node, 120)
  if (node === null) return 'null'
  return String(node)
}

async function copyPath(path) {
  if (await copyText(path)) globalToast(`已复制路径：${path}`)
}

async function copyValue(node) {
  const serialized = typeof node === 'string'
    ? node
    : node !== null && typeof node === 'object'
      ? JSON.stringify(node, null, 2)
      : String(node)
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
  padding: 0.45rem 0.6rem;
  color: var(--text-sub);
  font-size: 0.72rem;
}
</style>
