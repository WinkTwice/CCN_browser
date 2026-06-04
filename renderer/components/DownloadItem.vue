<template>
  <li class="download-item" :class="['status-' + status]">
    <div class="icon-col">
      <div class="file-icon" :title="mimeType || ''">
        <span class="ext">{{ extLabel }}</span>
      </div>
    </div>

    <div class="main">
      <div class="line name-line">
        <span class="name" :title="filename">{{ filename }}</span>
        <span class="status-tag" v-if="statusLabel">{{ statusLabel }}</span>
      </div>

      <div class="line meta-line">
        <span class="url" :title="url">{{ shortUrl }}</span>
        <span class="sep">·</span>
        <span class="size">{{ sizeText }}</span>
        <template v-if="status === 'downloading' || status === 'paused'">
          <span class="sep">·</span>
          <span class="speed">{{ speedText }}</span>
          <span class="sep">·</span>
          <span class="eta">{{ etaText }}</span>
        </template>
      </div>

      <div class="progress" v-if="showProgress">
        <div class="progress-bar" :style="{ width: progressPercent + '%' }" />
      </div>

      <div v-if="errorMessage" class="error">{{ errorMessage }}</div>
    </div>

    <div class="actions">
      <button
        v-if="status === 'downloading'"
        class="icon-btn"
        title="暂停"
        @click="$emit('pause', item)"
      >⏸</button>

      <button
        v-if="status === 'paused' || status === 'queued'"
        class="icon-btn"
        title="继续"
        @click="$emit('resume', item)"
      >▶</button>

      <button
        v-if="status === 'failed' || status === 'cancelled'"
        class="icon-btn"
        title="重试"
        @click="$emit('retry', item)"
      >↻</button>

      <button
        v-if="status === 'completed'"
        class="icon-btn"
        title="打开文件"
        @click="$emit('open', item)"
      >📄</button>

      <button
        v-if="status === 'completed'"
        class="icon-btn"
        title="打开所在文件夹"
        @click="$emit('open-folder', item)"
      >📁</button>

      <button
        v-if="status !== 'completed'"
        class="icon-btn"
        title="取消"
        @click="$emit('cancel', item)"
      >✕</button>

      <button
        v-else
        class="icon-btn danger"
        title="从列表移除"
        @click="$emit('remove', item)"
      >✕</button>
    </div>
  </li>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
})

defineEmits(['pause', 'resume', 'cancel', 'retry', 'open', 'open-folder', 'remove'])

const status = computed(() => props.item.status || 'downloading')
const filename = computed(() => props.item.filename || props.item.name || '未命名')
const url = computed(() => props.item.url || '')

const mimeType = computed(() => props.item.mimeType || '')

const extLabel = computed(() => {
  const name = filename.value
  const i = name.lastIndexOf('.')
  if (i === -1 || i === name.length - 1) return 'FILE'
  return name.slice(i + 1).toUpperCase().slice(0, 4)
})

const shortUrl = computed(() => {
  try {
    const u = new URL(url.value)
    return u.host + (u.pathname.length > 1 ? u.pathname : '')
  } catch {
    return url.value
  }
})

const totalBytes = computed(() => Number(props.item.totalBytes) || 0)
const receivedBytes = computed(() => Number(props.item.receivedBytes) || 0)

const sizeText = computed(() => formatSize(receivedBytes.value) + ' / ' + formatSize(totalBytes.value))

const speedText = computed(() => formatSize(props.item.speed || 0) + '/s')

const etaText = computed(() => {
  const speed = Number(props.item.speed) || 0
  if (!speed || !totalBytes.value) return '--:--'
  const remain = (totalBytes.value - receivedBytes.value) / speed
  return formatEta(remain)
})

const progressPercent = computed(() => {
  if (status.value === 'completed') return 100
  if (!totalBytes.value) return 0
  return Math.min(100, Math.round((receivedBytes.value / totalBytes.value) * 100))
})

const showProgress = computed(() =>
  ['downloading', 'paused', 'completed'].includes(status.value),
)

const errorMessage = computed(() => props.item.error || '')

const STATUS_MAP = {
  queued: { label: '等待中', order: 0 },
  downloading: { label: '下载中', order: 1 },
  paused: { label: '已暂停', order: 2 },
  completed: { label: '已完成', order: 3 },
  failed: { label: '失败', order: 4 },
  cancelled: { label: '已取消', order: 5 },
}

const statusLabel = computed(() => STATUS_MAP[status.value]?.label || '')

function formatSize(bytes) {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + ' ' + units[i]
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const s = Math.round(seconds)
  if (s < 60) return s + ' 秒'
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return m + ':' + String(r).padStart(2, '0')
  const h = Math.floor(m / 60)
  return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(r).padStart(2, '0')
}
</script>

<style scoped>
.download-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #eef0f3;
  transition: background 0.1s;
}
.download-item:hover {
  background: #f7f8fa;
}
.download-item:hover .actions {
  display: flex;
}

.icon-col {
  flex-shrink: 0;
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.file-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #e8eaef;
  color: #4e5969;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-align: center;
  overflow: hidden;
  word-break: break-all;
  line-height: 1.1;
  padding: 2px;
}
.status-completed .file-icon {
  background: #e8f5e9;
  color: #2e7d32;
}
.status-failed .file-icon {
  background: #ffece8;
  color: #d93025;
}
.status-paused .file-icon {
  background: #fff3e0;
  color: #e08a00;
}

.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #4e5969;
  min-width: 0;
}
.name-line {
  color: #1f2329;
}
.name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.status-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #eef0f3;
  color: #4e5969;
}
.status-completed .status-tag {
  background: #e8f5e9;
  color: #2e7d32;
}
.status-failed .status-tag {
  background: #ffece8;
  color: #d93025;
}
.status-paused .status-tag {
  background: #fff3e0;
  color: #e08a00;
}
.meta-line {
  font-size: 11px;
  color: #86909c;
}
.url {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}
.sep {
  color: #c9cdd4;
}

.progress {
  width: 100%;
  height: 4px;
  background: #eef0f3;
  border-radius: 2px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: #165dff;
  border-radius: 2px;
  transition: width 0.2s ease;
}
.status-paused .progress-bar {
  background: #c9cdd4;
}
.status-completed .progress-bar {
  background: #2e7d32;
}
.status-failed .progress-bar {
  background: #d93025;
}

.error {
  font-size: 11px;
  color: #d93025;
}

.actions {
  display: none;
  flex-shrink: 0;
  gap: 2px;
  align-items: center;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #4e5969;
  font-size: 12px;
}
.icon-btn:hover {
  background: #e8eaef;
}
.icon-btn.danger:hover {
  background: #ffece8;
  color: #d93025;
}
</style>
