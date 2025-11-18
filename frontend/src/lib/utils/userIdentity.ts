/**
 * Система идентификации пользователей без авторизации
 */

/**
 * Генерация уникального хэша для веб-пользователя
 */
export function generateUserHash(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 15)
  return `web_${timestamp}_${randomPart}`
}

/**
 * Получение или создание userHash из localStorage
 */
export function getUserHash(): string {
  const STORAGE_KEY = 'ai_tutor_user_hash'
  
  if (typeof window === 'undefined') return ''
  
  let hash = localStorage.getItem(STORAGE_KEY)
  
  if (!hash) {
    hash = generateUserHash()
    localStorage.setItem(STORAGE_KEY, hash)
    console.log('✅ Created new user hash:', hash)
  }
  
  return hash
}

/**
 * Получение данных пользователя Telegram WebApp
 */
export function getTelegramUserData(): {
  source: 'telegram'
  userHash: string
  telegramId?: string
  firstName?: string
  lastName?: string
  username?: string
} | null {
  if (typeof window === 'undefined') return null
  
  const tg = (window as any).Telegram?.WebApp
  if (!tg?.initDataUnsafe?.user) return null
  
  const user = tg.initDataUnsafe.user
  
  return {
    source: 'telegram',
    userHash: user.username || `tg_${user.id}`,
    telegramId: user.id?.toString(),
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username
  }
}

/**
 * Получение текущего пользователя (веб или Telegram)
 */
export function getCurrentUser(): {
  source: 'web' | 'telegram'
  userHash: string
  telegramId?: string
  firstName?: string
  lastName?: string
  username?: string
} {
  // Сначала проверяем Telegram
  const tgUser = getTelegramUserData()
  if (tgUser) {
    return tgUser
  }
  
  // Иначе используем веб хэш
  return {
    source: 'web',
    userHash: getUserHash()
  }
}

/**
 * Очистка пользовательских данных (для отладки)
 */
export function clearUserData(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('ai_tutor_user_hash')
  console.log('🧹 User data cleared')
}

