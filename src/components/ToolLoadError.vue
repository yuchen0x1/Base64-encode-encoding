<template>
  <div class="tool-load-error glass-panel" role="alert">
    <strong>工具模块加载失败</strong>
    <p>{{ message }}</p>
    <button class="btn btn-secondary btn-sm" type="button" @click="retry">重新加载</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  error: { type: Error, default: null },
  retry: { type: Function, default: () => {} }
})

const message = computed(() => props.error?.message || '请重试或重新启动应用。')
</script>

<style scoped>
.tool-load-error {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  padding: 2rem;
  text-align: center;
}
.tool-load-error strong { color: var(--accent-red); }
.tool-load-error p { max-width: 560px; color: var(--text-muted); font-size: 0.8rem; }
</style>
