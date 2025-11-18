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
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
    console.log('✅ Generation cached:', generation.id, generation.status)
  } catch (error) {
    console.error('Failed to cache generation:', error)
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
    console.log('🗑️ Generation removed from cache:', id)
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
    console.log('🧹 Generations cache cleared')
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

