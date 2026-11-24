<template>
  <Teleport to="body">
    <Transition name="cmdk" appear>
      <div v-if="open" class="cmdk-backdrop" @mousedown.self="requestClose">
        <section
          ref="dialogRef"
          class="cmdk-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="labels.title"
          @keydown="handleDialogKeydown"
        >
          <div class="cmdk-search-row">
            <Search :size="20" class="cmdk-search-icon" aria-hidden="true" />
            <input
              ref="searchInput"
              v-model="query"
              class="cmdk-input"
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="command-palette-list"
              :aria-expanded="results.length > 0"
              :aria-activedescendant="activeCommand ? commandOptionId(activeCommand.id) : undefined"
              :placeholder="labels.placeholder"
              :aria-label="labels.inputLabel"
              autocomplete="off"
              spellcheck="false"
            />
            <button ref="closeButton" type="button" class="cmdk-close" :aria-label="labels.close" :title="labels.close" @click="requestClose">
              <X :size="17" />
            </button>
          </div>

          <div id="command-palette-list" class="cmdk-list" role="listbox" :aria-label="labels.resultLabel">
            <template v-for="(command, index) in results" :key="command.id">
              <div
                v-if="needsSectionHeader(index)"
                class="cmdk-section-label"
                role="presentation"
              >
                <span>{{ labels.sections[command.sectionKey] || labels.sections.tools }}</span>
                <span class="cmdk-section-line"></span>
              </div>
              <button
                :id="commandOptionId(command.id)"
                type="button"
                role="option"
                tabindex="-1"
                :aria-selected="index === activeIndex"
                :class="['cmdk-option', index === activeIndex ? 'active' : '']"
                @mouseenter="activeIndex = index"
                @mousedown.prevent
                @click="selectCommand(command)"
              >
                <span class="cmdk-option-icon" aria-hidden="true">
                  <component :is="resolveIcon(command.icon)" :size="17" />
                </span>
                <span class="cmdk-option-main">
                  <span class="cmdk-option-title-row">
                    <span class="cmdk-option-title">{{ command.title }}</span>
                    <span v-if="command.pinned" class="cmdk-badge pinned">
                      <Star :size="10" :fill="'currentColor'" aria-hidden="true" />
                      {{ labels.pinned }}
                    </span>
                    <span v-else-if="isRecent(command)" class="cmdk-badge recent">
                      <Clock3 :size="10" aria-hidden="true" />
                      {{ labels.recent }}
                    </span>
                    <span class="cmdk-badge type">{{ command.type === 'action' ? labels.action : labels.tool }}</span>
                  </span>
                  <span v-if="command.subtitle" class="cmdk-option-subtitle">{{ command.subtitle }}</span>
                </span>
                <CornerDownLeft v-if="index === activeIndex" :size="15" class="cmdk-enter-icon" aria-hidden="true" />
              </button>
            </template>
            <div v-if="!results.length" class="cmdk-empty" role="status">
              <Search :size="24" aria-hidden="true" />
              <span>{{ labels.empty }}</span>
            </div>
          </div>

          <footer class="cmdk-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> {{ labels.navigate }}</span>
            <span><kbd>Enter</kbd> {{ labels.select }}</span>
            <span><kbd>Esc</kbd> {{ labels.dismiss }}</span>
            <span class="cmdk-local"><ShieldCheck :size="13" aria-hidden="true" /> {{ labels.localOnly }}</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  AlignLeft,
  Binary,
  Braces,
  Calculator,
  Clock,
  Clock3,
  CornerDownLeft,
  Cpu,
  Database,
  Download,
  FileCode2,
  GitCompare,
  Globe,
  Hash,
  Image,
  Keyboard,
  KeyRound,
  Layers,
  LayoutGrid,
  Lock,
  MessageCircle,
  Moon,
  Palette,
  QrCode,
  Regex,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Upload,
  Wrench,
  X,
  Zap
} from 'lucide-vue-next'
import { commandOptionId, filterCommands, moveCommandIndex } from '../utils/commandPalette.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  commands: { type: Array, default: () => [] },
  labels: { type: Object, required: true }
})
const emit = defineEmits(['close', 'select'])

const query = ref('')
const activeIndex = ref(0)
const searchInput = ref(null)
const closeButton = ref(null)
const dialogRef = ref(null)
let restoreFocusTarget = null

const iconMap = {
  AlignLeft,
  Binary,
  Braces,
  Calculator,
  Clock,
  Cpu,
  Database,
  Download,
  FileCode2,
  GitCompare,
  Globe,
  Hash,
  Image,
  Keyboard,
  KeyRound,
  Layers,
  LayoutGrid,
  Lock,
  MessageCircle,
  Moon,
  Palette,
  QrCode,
  Regex,
  Sparkles,
  Sun,
  Upload,
  Wrench,
  Zap
}

const results = computed(() => filterCommands(props.commands, query.value))
const activeCommand = computed(() => results.value[activeIndex.value] || null)

function resolveIcon(name) {
  return iconMap[name] || Wrench
}

function isRecent(command) {
  return command.type === 'tool' && !command.pinned &&
    Number.isFinite(command.recentIndex) && command.recentIndex < Number.MAX_SAFE_INTEGER
}

function needsSectionHeader(index) {
  if (index === 0) return true
  return results.value[index - 1]?.sectionKey !== results.value[index]?.sectionKey
}

function requestClose() {
  emit('close')
}

function selectCommand(command) {
  if (!command) return
  emit('select', command)
}

function setActive(index) {
  activeIndex.value = moveCommandIndex(index, 0, results.value.length)
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    requestClose()
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    const focusIsClose = document.activeElement === closeButton.value
    const next = event.shiftKey
      ? (focusIsClose ? searchInput.value : closeButton.value)
      : (focusIsClose ? searchInput.value : closeButton.value)
    next?.focus()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = moveCommandIndex(activeIndex.value, 1, results.value.length)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = moveCommandIndex(activeIndex.value, -1, results.value.length)
    return
  }
  if (event.key === 'PageDown') {
    event.preventDefault()
    activeIndex.value = moveCommandIndex(activeIndex.value, 5, results.value.length)
    return
  }
  if (event.key === 'PageUp') {
    event.preventDefault()
    activeIndex.value = moveCommandIndex(activeIndex.value, -5, results.value.length)
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    setActive(0)
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    setActive(results.value.length - 1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    selectCommand(activeCommand.value)
  }
}

watch(() => props.open, async open => {
  if (open) {
    restoreFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
    query.value = ''
    activeIndex.value = 0
    await nextTick()
    searchInput.value?.focus()
    dialogRef.value?.scrollTo?.({ top: 0 })
  } else if (restoreFocusTarget?.isConnected) {
    const target = restoreFocusTarget
    restoreFocusTarget = null
    await nextTick()
    target.focus()
  }
}, { immediate: true })

watch(query, () => {
  activeIndex.value = results.value.length ? 0 : -1
})

watch(results, list => {
  if (!list.length) activeIndex.value = -1
  else if (activeIndex.value < 0 || activeIndex.value >= list.length) activeIndex.value = 0
})
</script>

<style scoped>
.cmdk-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(4.5rem, 12vh, 8.5rem) 1.25rem 2rem;
  background:
    radial-gradient(circle at 50% 18%, rgba(var(--rgb-primary), 0.12), transparent 36%),
    rgba(2, 6, 23, 0.58);
  backdrop-filter: blur(10px) saturate(120%);
}
html:not(.dark) .cmdk-backdrop {
  background:
    radial-gradient(circle at 50% 18%, rgba(var(--rgb-primary), 0.1), transparent 36%),
    rgba(15, 23, 42, 0.24);
}
.cmdk-dialog {
  width: min(700px, 100%);
  max-height: min(72vh, 680px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text-main);
  background:
    linear-gradient(180deg, rgba(var(--rgb-primary), 0.045), transparent 120px),
    var(--bg-card);
  border: 1px solid rgba(var(--rgb-primary), 0.24);
  border-radius: 1rem;
  box-shadow:
    0 30px 80px -18px rgba(0, 0, 0, 0.75),
    0 0 0 1px rgba(255, 255, 255, 0.035) inset,
    0 0 45px rgba(var(--rgb-primary), 0.08);
  backdrop-filter: blur(24px) saturate(135%);
}
.cmdk-search-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 66px;
  padding: 0 1rem 0 1.15rem;
  border-bottom: 1px solid var(--border-color);
}
.cmdk-search-icon {
  color: var(--accent-cyan);
  flex-shrink: 0;
  filter: drop-shadow(0 0 7px rgba(var(--rgb-cyan), 0.35));
}
.cmdk-input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-main);
  font: inherit;
  font-size: 1.02rem;
  letter-spacing: -0.01em;
}
.cmdk-input::placeholder {
  color: var(--text-sub);
}
.cmdk-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 0.45rem;
  background: var(--bg-input);
  color: var(--text-muted);
  cursor: pointer;
}
.cmdk-close:hover,
.cmdk-close:focus-visible {
  color: var(--accent-red);
  border-color: rgba(var(--rgb-red), 0.5);
  outline: none;
}
.cmdk-list {
  flex: 1;
  min-height: 140px;
  overflow-y: auto;
  padding: 0.55rem;
  overscroll-behavior: contain;
}
.cmdk-section-label {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.7rem 0.65rem 0.4rem;
  color: var(--text-sub);
  font-family: var(--font-mono);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.cmdk-section-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border-color), transparent);
}
.cmdk-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.68rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--text-main);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
}
.cmdk-option.active {
  background:
    linear-gradient(90deg, rgba(var(--rgb-primary), 0.16), rgba(var(--rgb-cyan), 0.055));
  border-color: rgba(var(--rgb-primary), 0.28);
  transform: translateX(2px);
}
.cmdk-option-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid rgba(var(--rgb-primary), 0.18);
  border-radius: 0.5rem;
  background: rgba(var(--rgb-primary), 0.08);
  color: var(--accent-cyan);
}
.cmdk-option.active .cmdk-option-icon {
  background: rgba(var(--rgb-primary), 0.14);
  border-color: rgba(var(--rgb-primary), 0.34);
  box-shadow: 0 0 14px rgba(var(--rgb-primary), 0.12);
}
.cmdk-option-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.16rem;
}
.cmdk-option-title-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.cmdk-option-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 650;
}
.cmdk-option-subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.cmdk-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  flex-shrink: 0;
  padding: 0.08rem 0.3rem;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.cmdk-badge.pinned {
  color: var(--accent-amber);
  background: rgba(var(--rgb-amber), 0.11);
  border: 1px solid rgba(var(--rgb-amber), 0.24);
}
.cmdk-badge.recent {
  color: var(--accent-cyan);
  background: rgba(var(--rgb-cyan), 0.1);
  border: 1px solid rgba(var(--rgb-cyan), 0.2);
}
.cmdk-badge.type {
  color: var(--text-sub);
  border: 1px solid var(--border-color);
}
.cmdk-enter-icon {
  flex-shrink: 0;
  color: var(--accent-cyan);
}
.cmdk-empty {
  min-height: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  color: var(--text-sub);
  font-size: 0.82rem;
}
.cmdk-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 40px;
  padding: 0.45rem 1rem;
  border-top: 1px solid var(--border-color);
  background: var(--surface-inset);
  color: var(--text-sub);
  font-size: 0.67rem;
}
.cmdk-footer span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.cmdk-footer kbd {
  min-width: 18px;
  padding: 0.08rem 0.28rem;
  border: 1px solid var(--border-color);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--bg-input);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  text-align: center;
}
.cmdk-local {
  margin-left: auto;
  color: var(--accent-green);
}
.cmdk-enter-active,
.cmdk-leave-active {
  transition: opacity 0.16s ease;
}
.cmdk-enter-active .cmdk-dialog,
.cmdk-leave-active .cmdk-dialog {
  transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.16s ease;
}
.cmdk-enter-from,
.cmdk-leave-to {
  opacity: 0;
}
.cmdk-enter-from .cmdk-dialog,
.cmdk-leave-to .cmdk-dialog {
  opacity: 0;
  transform: translateY(-9px) scale(0.985);
}
@media (max-width: 640px) {
  .cmdk-backdrop { padding: 4.25rem 0.65rem 1rem; }
  .cmdk-footer span:nth-child(3),
  .cmdk-local { display: none; }
  .cmdk-badge.type { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .cmdk-enter-active,
  .cmdk-leave-active,
  .cmdk-enter-active .cmdk-dialog,
  .cmdk-leave-active .cmdk-dialog,
  .cmdk-option {
    transition: none;
  }
}
</style>
