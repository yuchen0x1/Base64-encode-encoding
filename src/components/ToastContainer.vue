<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" :class="['toast-item', t.type]">
        <span class="toast-dot"></span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { useToast } from '../composables/useToast.js'

const { toasts } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  pointer-events: none;
  max-width: 360px;
}
.toast-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  background: var(--bg-card);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  font-size: 0.825rem;
  color: var(--text-main);
}
.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
  flex-shrink: 0;
}
.toast-item.success {
  border-color: rgba(52, 211, 153, 0.4);
}
.toast-item.success .toast-dot {
  background: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}
.toast-item.error {
  border-color: rgba(239, 68, 68, 0.4);
}
.toast-item.error .toast-dot {
  background: var(--accent-red);
  box-shadow: 0 0 8px var(--accent-red);
}
.toast-enter-active, .toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
@media (max-width: 768px) {
  .toast-container {
    bottom: 1rem;
    right: 1rem;
    left: 1rem;
    max-width: none;
    align-items: stretch;
  }
}
</style>