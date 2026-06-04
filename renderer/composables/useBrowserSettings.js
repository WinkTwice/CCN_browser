import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'ccn:browser-settings:v1'

const SEARCH_ENGINES = [
  {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q={query}',
  },
  {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q={query}',
  },
  {
    id: 'baidu',
    name: 'Baidu',
    searchUrl: 'https://www.baidu.com/s?wd={query}',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q={query}',
  },
]

const defaultSettings = {
  searchEngineId: 'bing',
}

const settings = ref(loadSettings())

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultSettings }
    return normalizeSettings(JSON.parse(raw))
  } catch {
    return { ...defaultSettings }
  }
}

function normalizeSettings(input = {}) {
  const searchEngineId = SEARCH_ENGINES.some((item) => item.id === input.searchEngineId)
    ? input.searchEngineId
    : defaultSettings.searchEngineId

  return { searchEngineId }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
  } catch {}
}

function setSearchEngine(id) {
  if (!SEARCH_ENGINES.some((item) => item.id === id)) return
  settings.value = { ...settings.value, searchEngineId: id }
}

const searchEngines = SEARCH_ENGINES

const currentSearchEngine = computed(() =>
  SEARCH_ENGINES.find((item) => item.id === settings.value.searchEngineId) || SEARCH_ENGINES[0],
)

watch(settings, saveSettings, { deep: true })

export function useBrowserSettings() {
  return {
    settings,
    searchEngines,
    currentSearchEngine,
    setSearchEngine,
  }
}
