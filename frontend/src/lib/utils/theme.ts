/**
 * Тема приложения с поддержкой темной/светлой схемы
 * Использует CSS-переменные Telegram WebApp для адаптации
 */

export interface ThemeColors {
  // Background colors
  bgPrimary: string
  bgSecondary: string
  bgCard: string
  bgGradientFrom: string
  bgGradientTo: string
  
  // Text colors
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverse: string
  
  // Border colors
  borderLight: string
  borderMedium: string
  borderDark: string
  
  // Accent colors
  accentColor: string
  accentBg: string
  accentHover: string
  
  // Status colors
  success: string
  warning: string
  error: string
  info: string
  
  // Button colors
  buttonPrimary: string
  buttonSecondary: string
  buttonText: string
  
  // Shadow
  shadow: string
}

/**
 * Определяет является ли текущая тема темной
 */
export function isDarkTheme(): boolean {
  if (typeof window === 'undefined') return false
  
  // Проверяем Telegram WebApp theme
  if ((window as any).Telegram?.WebApp?.colorScheme) {
    return (window as any).Telegram.WebApp.colorScheme === 'dark'
  }
  
  // Fallback: проверяем системную тему
  if (window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  
  return false
}

/**
 * Получает текущую тему из CSS-переменных
 */
export function getCurrentTheme(): ThemeColors {
  const dark = isDarkTheme()
  
  return {
    bgPrimary: dark ? '#1a1a1a' : '#ffffff',
    bgSecondary: dark ? '#2d2d2d' : '#f5f5f5',
    bgCard: dark ? '#2d2d2d' : '#ffffff',
    bgGradientFrom: dark ? '#1a1a2e' : '#667eea',
    bgGradientTo: dark ? '#16213e' : '#764ba2',
    
    textPrimary: dark ? '#ffffff' : '#000000',
    textSecondary: dark ? '#b0b0b0' : '#6b7280',
    textMuted: dark ? '#808080' : '#9ca3af',
    textInverse: dark ? '#000000' : '#ffffff',
    
    borderLight: dark ? '#404040' : '#e5e7eb',
    borderMedium: dark ? '#505050' : '#d1d5db',
    borderDark: dark ? '#606060' : '#9ca3af',
    
    accentColor: dark ? '#3b82f6' : '#2563eb',
    accentBg: dark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.1)',
    accentHover: dark ? '#60a5fa' : '#1d4ed8',
    
    success: dark ? '#10b981' : '#059669',
    warning: dark ? '#f59e0b' : '#d97706',
    error: dark ? '#ef4444' : '#dc2626',
    info: dark ? '#3b82f6' : '#2563eb',
    
    buttonPrimary: dark ? '#3b82f6' : '#2563eb',
    buttonSecondary: dark ? '#4b5563' : '#e5e7eb',
    buttonText: '#ffffff',
    
    shadow: dark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)'
  }
}

/**
 * Применяет тему к корневому элементу
 */
export function applyTheme(theme: ThemeColors) {
  if (typeof document === 'undefined') return
  
  const root = document.documentElement
  
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(`--app-${key}`, value)
  })
}

/**
 * Инициализирует тему при загрузке
 */
export function initTheme() {
  if (typeof window === 'undefined') return
  
  const root = document.documentElement
  
  // Если Telegram WebApp доступен - помечаем атрибутом
  if ((window as any).Telegram?.WebApp?.colorScheme) {
    root.setAttribute('data-tg-theme', (window as any).Telegram.WebApp.colorScheme)
  }
  
  const theme = getCurrentTheme()
  applyTheme(theme)
  
  // Слушаем изменения темы Telegram WebApp
  if ((window as any).Telegram?.WebApp) {
    ;(window as any).Telegram.WebApp.onEvent('themeChanged', () => {
      root.setAttribute('data-tg-theme', (window as any).Telegram.WebApp.colorScheme || 'light')
      const newTheme = getCurrentTheme()
      applyTheme(newTheme)
    })
  }
  
  // Слушаем изменения системной темы
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (!(window as any).Telegram?.WebApp) {
        const newTheme = getCurrentTheme()
        applyTheme(newTheme)
      }
    })
  }
}

/**
 * Получает CSS-класс для градиентного фона
 */
export function getGradientClass(colors: string[]): string {
  return colors.join(' ')
}

/**
 * Создает градиент из массива цветов
 */
export function createGradient(colors: string[], direction: string = '135deg'): string {
  return `linear-gradient(${direction}, ${colors.join(', ')})`
}

