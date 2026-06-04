<template>
  <div class="tab-bar" :class="{ 'is-dragging': isDragging }">
    <div
      ref="scrollerRef"
      class="tab-scroller"
      @wheel.prevent="onWheel"
    >
      <ul class="tab-list">
        <TabItem
          v-for="(tab, index) in tabs"
          :key="tab.id"
          :tab="tab"
          :index="index"
          :active="tab.id === activeId"
          :closable="tabs.length > 1"
          :draggable="true"
          @select="selectTab(tab)"
          @close="closeTab(tab)"
          @middle-click="closeTab(tab)"
          @dragstart="onDragStart($event, index)"
          @dragover.prevent="onDragOver($event, index)"
          @dragend="onDragEnd"
          @drop.prevent="onDrop(index)"
          @aux-click="onAuxClick($event, tab)"
        />
      </ul>
    </div>

    <div class="tab-actions">
      <button
        class="action-btn"
        title="新建标签 (Ctrl+T)"
        @click="createTab"
      >＋</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useTabs } from '../composables/useTabs.js'
import TabItem from './TabItem.vue'

const emit = defineEmits(['tab-change', 'tab-create', 'tab-close'])

const {
  tabs,
  activeId,
  loading,
  loadTabs,
  createTab: createTabAction,
  closeTab: closeTabAction,
  selectTab: selectTabAction,
  moveTab,
} = useTabs()

const scrollerRef = ref(null)
const isDragging = ref(false)
const dragIndex = ref(-1)

function selectTab(tab) {
  selectTabAction(tab.id)
  emit('tab-change', tab)
}

function createTab() {
  const tab = createTabAction()
  emit('tab-create', tab)
}

function closeTab(tab) {
  closeTabAction(tab.id)
  emit('tab-close', tab)
}

function onAuxClick(e, tab) {
  if (e.button === 1) {
    e.preventDefault()
    closeTab(tab)
  }
}

function onWheel(e) {
  const el = scrollerRef.value
  if (!el) return
  if (e.deltaY === 0) return
  el.scrollLeft += e.deltaY
}

function onDragStart(e, index) {
  isDragging.value = true
  dragIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(e, index) {
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragIndex.value === -1 || dragIndex.value === index) return
}

function onDrop(index) {
  if (dragIndex.value === -1 || dragIndex.value === index) {
    onDragEnd()
    return
  }
  moveTab(dragIndex.value, index)
  onDragEnd()
}

function onDragEnd() {
  isDragging.value = false
  dragIndex.value = -1
}

onMounted(async () => {
  await loadTabs()
  await nextTick()
  scrollActiveIntoView()
})

function scrollActiveIntoView() {
  const el = scrollerRef.value
  if (!el) return
  const active = el.querySelector('.tab-item.active')
  if (!active) return
  const elRect = el.getBoundingClientRect()
  const itemRect = active.getBoundingClientRect()
  if (itemRect.left < elRect.left) {
    el.scrollLeft -= elRect.left - itemRect.left + 8
  } else if (itemRect.right > elRect.right) {
    el.scrollLeft += itemRect.right - elRect.right + 8
  }
}

defineExpose({ scrollActiveIntoView })
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: stretch;
  height: 36px;
  background: #e4e6eb;
  border-bottom: 1px solid #c9cdd4;
  user-select: none;
  position: relative;
}
.tab-bar.is-dragging {
  cursor: grabbing;
}

.tab-scroller {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-behavior: smooth;
  scrollbar-width: none;
}
.tab-scroller::-webkit-scrollbar {
  display: none;
}

.tab-list {
  display: flex;
  align-items: stretch;
  margin: 0;
  padding: 0;
  list-style: none;
  height: 100%;
  gap: 1px;
}

.tab-actions {
  display: flex;
  align-items: center;
  padding: 0 6px;
  border-left: 1px solid #c9cdd4;
  background: #f2f3f5;
}
.action-btn {
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
  font-size: 14px;
  line-height: 1;
}
.action-btn:hover {
  background: #e4e6eb;
  color: #1f2329;
}
</style>
