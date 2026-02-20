/**
 * Система кэширования генераций в localStorage
 */

const CACHE_KEY = 'ai_tutor_generations_cache'
const MAX_CACHE_SIZE = 100 // Максимальное количество генераций в кэше

export interface CachedGeneration {
  id: string
  userId: string
  type: string
  status: 'pending' | 'completed' | 'failed'
  params: any
  result?: any
  error?: string
  createdAt: string
  updatedAt: string
}

/**
 * Получить все генерации из кэша
 */
export function getCachedGenerations(): CachedGeneration[] {
  if (typeof window === 'undefined') return []

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return []
    return JSON.parse(cached)
  } catch (error) {
    console.error('Failed to read generations cache:', error)
    return []
  }
}

/**
 * Добавить или обновить генерацию в кэше
 */
export function cacheGeneration(generation: CachedGeneration): void {
  if (typeof window === 'undefined') return

  try {
    const cached = getCachedGenerations()

    // Найти существующую генерацию
    const existingIndex = cached.findIndex(g => g.id === generation.id)

    if (existingIndex >= 0) {
      // Обновить существующую
      cached[existingIndex] = {
        ...cached[existingIndex],
        ...generation,
        updatedAt: new Date().toISOString()
      }
    } else {
      // Добавить новую в начало
      cached.unshift({
        ...generation,
        createdAt: generation.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      // Ограничить размер кэша
      if (cached.length > MAX_CACHE_SIZE) {
        cached.splice(MAX_CACHE_SIZE)
      }
    }

    // Пытаемся сохранить, если превышена квота - удаляем старые записи
    let saved = false;
    let currentCached = [...cached];

    while (!saved && currentCached.length > 0) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(currentCached));
        saved = true;
      } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.message?.includes('exceeded the quota')) {
          // Удаляем 20% самых старых записей
          const removeCount = Math.max(1, Math.floor(currentCached.length * 0.2));
          currentCached = currentCached.slice(0, currentCached.length - removeCount);
          console.warn(`Local storage quota exceeded. Removed ${removeCount} old generations from cache. Retrying...`);
        } else {
          console.error('Failed to cache generation:', e);
          break;
        }
      }
    }
  } catch (error) {
    console.error('Failed to update generation cache:', error);
  }
}

/**
 * Получить генерацию из кэша по ID
 */
export function getCachedGeneration(id: string): CachedGeneration | null {
  const cached = getCachedGenerations()
  return cached.find(g => g.id === id) || null
}

/**
 * Удалить генерацию из кэша
 */
export function removeCachedGeneration(id: string): void {
  if (typeof window === 'undefined') return

  try {
    const cached = getCachedGenerations()
    const filtered = cached.filter(g => g.id !== id)
    localStorage.setItem(CACHE_KEY, JSON.stringify(filtered))

  } catch (error) {
    console.error('Failed to remove generation from cache:', error)
  }
}

/**
 * Получить генерации для конкретного пользователя
 */
export function getUserGenerations(userId: string): CachedGeneration[] {
  const cached = getCachedGenerations()
  return cached.filter(g => g.userId === userId)
}

/**
 * Очистить весь кэш
 */
export function clearGenerationsCache(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(CACHE_KEY)

  } catch (error) {
    console.error('Failed to clear cache:', error)
  }
}

/**
 * Получить статистику кэша
 */
export function getCacheStats() {
  const cached = getCachedGenerations()
  return {
    total: cached.length,
    pending: cached.filter(g => g.status === 'pending').length,
    completed: cached.filter(g => g.status === 'completed').length,
    failed: cached.filter(g => g.status === 'failed').length
  }
}

