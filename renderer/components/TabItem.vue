<template>
  <li
    class="tab-item"
    :class="{
      active,
      pinned,
      loading: tab.loading,
      audible: tab.audible && !tab.muted,
      muted: tab.muted,
      modified: tab.modified,
    }"
    :draggable="draggable"
    :title="tab.tooltip || tab.title || tab.url || '新标签'"
    @click="$emit('select')"
    @auxclick="$emit('aux-click', $event)"
    @dragstart="$emit('dragstart', $event)"
    @dragover="$emit('dragover', $event)"
    @dragend="$emit('dragend')"
    @drop="$emit('drop', $event)"
  >
    <span class="leading">
      <img
        v-if="tab.favicon && !faviconFailed"
        :src="tab.favicon"
        class="favicon"
        alt=""
        @error="faviconFailed = true"
      />
      <span v-else class="favicon fallback">🌐</span>
      <span v-if="tab.loading" class="spinner" aria-hidden="true" />
      <span v-else-if="tab.audible && !tab.muted" class="audio" title="正在播放音频">🔊</span>
      <span v-else-if="tab.muted" class="audio muted" title="已静音">🔇</span>
    </span>

    <span class="title" :class="{ ellipsis: ellipsis }">
      {{ tab.title || tab.url || '新标签' }}
    </span>

    <span v-if="tab.modified" class="modified-dot" title="未保存的更改" />

    <button
      v-if="closable"
      class="close"
      :title="closeTitle"
      @click.stop="$emit('close')"
      @mousedown.stop
      @auxclick.stop
    >
      <span v-if="tab.loading" class="close-x loading-x" />
      <span v-else class="close-x">✕</span>
    </button>
  </li>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  tab: {
    type: Object,
    required: true,
  },
  index: {
    type: Number,
    default: -1,
  },
  active: {
    type: Boolean,
    default: false,
  },
  closable: {
    type: Boolean,
    default: true,
  },
  draggable: {
    type: Boolean,
    default: true,
  },
})

defineEmits([
  'select',
  'close',
  'aux-click',
  'middle-click',
  'dragstart',
  'dragover',
  'dragend',
  'drop',
])

const faviconFailed = ref(false)

const pinned = computed(() => Boolean(props.tab.pinned))
const ellipsis = computed(() => (props.tab.title || '').length > 24)

const closeTitle = computed(() => {
  if (props.tab.loading) return '停止加载 (Ctrl+W)'
  return '关闭标签 (Ctrl+W)'
})
</script>

<style scoped>
.tab-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  min-width: 60px;
  max-width: 220px;
  flex: 0 1 180px;
  padding: 0 8px 0 10px;
  background: #dde0e5;
  border-right: 1px solid #c9cdd4;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: #4e5969;
  transition: background 0.1s;
}
.tab-item:hover {
  background: #e8eaef;
}
.tab-item.active {
  background: #ffffff;
  color: #1f2329;
  box-shadow: inset 0 2px 0 0 #165dff;
}
.tab-item.pinned {
  flex: 0 0 36px;
  min-width: 36px;
  max-width: 36px;
  padding: 0;
  justify-content: center;
}
.tab-item.pinned .title,
.tab-item.pinned .modified-dot,
.tab-item.pinned .close {
  display: none;
}

.leading {
  position: relative;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 2px;
}
.favicon.fallback {
  font-size: 12px;
  line-height: 1;
}
.spinner {
  position: absolute;
  inset: 0;
  border: 2px solid #c9cdd4;
  border-top-color: #165dff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.audio {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  line-height: 1;
}
.audio.muted {
  opacity: 0.7;
}

.title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.title.ellipsis {
  direction: rtl;
  text-align: left;
}

.modified-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #165dff;
  flex-shrink: 0;
}

.close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
  color: #86909c;
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.1s, background 0.1s;
}
.tab-item:hover .close,
.tab-item.active .close {
  opacity: 1;
}
.close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #1f2329;
}
.close-x {
  display: inline-block;
  line-height: 1;
}
.close-x.loading-x {
  width: 8px;
  height: 8px;
  border: 2px solid #86909c;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
