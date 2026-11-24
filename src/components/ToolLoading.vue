<template>
  <div class="tool-loading glass-panel" role="status" aria-live="polite">
    <span class="loading-orbit" aria-hidden="true"></span>
    <div>
      <strong>正在加载本地工具…</strong>
      <p>按需载入界面模块，输入数据不会离开本机。</p>
    </div>
  </div>
</template>

<style scoped>
.tool-loading {
  min-height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  color: var(--text-muted);
}
.tool-loading strong {
  display: block;
  color: var(--text-main);
  font-size: 0.9rem;
}
.tool-loading p {
  margin-top: 0.25rem;
  font-size: 0.78rem;
}
.loading-orbit {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 2px solid rgba(var(--rgb-primary), 0.18);
  border-top-color: var(--accent-cyan);
  border-radius: 50%;
  animation: tool-orbit 0.8s linear infinite;
}
@keyframes tool-orbit {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .loading-orbit { animation-duration: 2.4s; }
}
</style>
