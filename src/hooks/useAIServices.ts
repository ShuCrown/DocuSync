import { useState, useCallback, useEffect } from 'react'

export interface AIService {
  id: string
  name: string
  url: string
  iconUrl: string
  fallback: string
  color: string
  enabled: boolean
  order: number
  removed?: boolean // only for default services marked as deleted
}

const STORAGE_KEY = 'docusync-ai-services'

const DEFAULT_SERVICES: AIService[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    iconUrl: '/deepseek.svg',
    fallback: 'D',
    color: '#4D6BFE',
    enabled: true,
    order: 0,
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com/chat/',
    iconUrl: '/doubao.svg',
    fallback: '豆',
    color: '#3B82F6',
    enabled: true,
    order: 1,
  },
  {
    id: 'kimi',
    name: 'Kimi',
    url: 'https://kimi.moonshot.cn/',
    iconUrl: 'https://statics.moonshot.cn/kimi-chat/favicon.ico',
    fallback: 'K',
    color: '#000000',
    enabled: true,
    order: 2,
  },
  {
    id: 'tongyi',
    name: '通义千问',
    url: 'https://tongyi.aliyun.com/qianwen/',
    iconUrl: '/qianwen.svg',
    fallback: '通',
    color: '#F59E0B',
    enabled: true,
    order: 3,
  },
]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function generateColor() {
  const colors = ['#4D6BFE', '#3B82F6', '#6366F1', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899']
  return colors[Math.floor(Math.random() * colors.length)]
}

/** Load user overrides from localStorage */
function loadOverrides(): Record<string, Partial<AIService>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/** Save user overrides to localStorage */
function saveOverrides(overrides: Record<string, Partial<AIService>>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

/** Merge defaults with user overrides, include user-added services */
function mergeServices(overrides: Record<string, Partial<AIService>>): AIService[] {
  const services: AIService[] = []

  // Start with defaults, apply overrides
  for (const def of DEFAULT_SERVICES) {
    const ov = overrides[def.id]
    // Skip default services that the user has removed
    if (ov?.removed) continue
    if (ov) {
      services.push({ ...def, ...ov, id: def.id })
    } else {
      services.push({ ...def })
    }
  }

  // Add user-created services (not in defaults)
  const defaultIds = new Set(DEFAULT_SERVICES.map((s) => s.id))
  for (const [id, ov] of Object.entries(overrides)) {
    if (!defaultIds.has(id) && ov.name && ov.url) {
      services.push({
        id,
        name: ov.name!,
        url: ov.url!,
        iconUrl: ov.iconUrl ?? '',
        fallback: ov.fallback ?? ov.name![0],
        color: ov.color ?? generateColor(),
        enabled: ov.enabled ?? true,
        order: ov.order ?? services.length,
      })
    }
  }

  // Sort by order
  services.sort((a, b) => a.order - b.order)
  // Reassign sequential order
  services.forEach((s, i) => { s.order = i })

  return services
}

export function useAIServices() {
  const [overrides, setOverrides] = useState<Record<string, Partial<AIService>>>(loadOverrides)

  // Sync to localStorage on change
  useEffect(() => {
    saveOverrides(overrides)
  }, [overrides])

  const services = mergeServices(overrides)
  const enabledServices = services.filter((s) => s.enabled)

  const updateService = useCallback((id: string, patch: Partial<AIService>) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }, [])

  const addService = useCallback((name: string, url: string, iconUrl?: string) => {
    const id = generateId()
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        name,
        url,
        iconUrl: iconUrl || '',
        fallback: name[0],
        color: generateColor(),
        enabled: true,
        order: Object.keys(prev).length + DEFAULT_SERVICES.length,
      },
    }))
    return id
  }, [])

  const removeService = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = { ...prev }
      // Mark default services as removed; delete custom ones entirely
      const isDefault = DEFAULT_SERVICES.some((s) => s.id === id)
      if (isDefault) {
        next[id] = { ...next[id], enabled: false, removed: true }
      } else {
        delete next[id]
      }
      return next
    })
  }, [])

  const moveService = useCallback((id: string, direction: 'up' | 'down') => {
    setOverrides((prev) => {
      const merged = mergeServices(prev)
      const idx = merged.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= merged.length) return prev

      const next = { ...prev }
      // Swap order values
      const a = merged[idx]
      const b = merged[target]
      next[a.id] = { ...next[a.id], order: b.order }
      next[b.id] = { ...next[b.id], order: a.order }
      return next
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    setOverrides({})
  }, [])

  const toggleService = useCallback((id: string) => {
    setOverrides((prev) => {
      const current = mergeServices(prev).find((s) => s.id === id)
      return { ...prev, [id]: { ...prev[id], enabled: !current?.enabled } }
    })
  }, [])

  return {
    services,
    enabledServices,
    addService,
    removeService,
    moveService,
    toggleService,
    resetToDefaults,
    updateService,
  }
}
