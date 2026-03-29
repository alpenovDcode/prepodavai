'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

/**
 * Читает initData из всех возможных источников:
 * - window.WebApp.initData (MAX SDK)
 * - window.Telegram.WebApp.initData (Telegram SDK)
 * - URL hash фрагмент #WebAppData=... (MAX передаёт сюда)
 * - URL query params (fallback)
 */
function extractInitData(): { initData: string | null; endpoint: string | null } {
  const tg = (window as any).Telegram?.WebApp
  const max = (window as any).WebApp

  if (tg?.initData && tg.initData.includes('hash=')) {
    return { initData: tg.initData, endpoint: '/auth/validate-init-data' }
  }

  if (max?.initData && max.initData.includes('hash=')) {
    return { initData: max.initData, endpoint: '/auth/max/validate-init-data' }
  }

  // MAX передаёт данные в URL-фрагменте: #WebAppData=...&WebAppPlatform=...
  const hash = window.location.hash
  if (hash && hash.includes('WebAppData=')) {
    try {
      const hashParams = new URLSearchParams(hash.slice(1))
      const webAppData = hashParams.get('WebAppData')
      if (webAppData) {
        const decoded = decodeURIComponent(webAppData)
        if (decoded.includes('hash=')) {
          return { initData: decoded, endpoint: '/auth/max/validate-init-data' }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  const urlParams = new URLSearchParams(window.location.search)
  const tgData = urlParams.get('tgWebAppData')
  if (tgData && tgData.includes('hash=')) {
    return { initData: tgData, endpoint: '/auth/validate-init-data' }
  }
  const maxData = urlParams.get('max_init_data')
  if (maxData && maxData.includes('hash=')) {
    return { initData: maxData, endpoint: '/auth/max/validate-init-data' }
  }

  return { initData: null, endpoint: null }
}

function hasMiniAppContext(): boolean {
  const tg = (window as any).Telegram?.WebApp
  const max = (window as any).WebApp
  const hash = window.location.hash
  const urlParams = new URLSearchParams(window.location.search)
  return !!(
    tg?.initData ||
    max?.initData ||
    (hash && hash.includes('WebAppData=')) ||
    urlParams.has('tgWebAppPlatform') ||
    urlParams.has('tgWebAppData') ||
    urlParams.has('max_init_data')
  )
}

export function useMiniAppAuth() {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Уже авторизован — ничего не делаем
    if (localStorage.getItem('prepodavai_authenticated') === 'true') {
      setReady(true)
      return
    }

    const run = async () => {
      // Сразу вызываем ready() — MAX требует это до показа контента
      ;(window as any).Telegram?.WebApp?.ready?.()
      ;(window as any).WebApp?.ready?.()

      // Если mini app контекст уже есть — пробуем сразу
      if (!hasMiniAppContext()) {
        // Ждём SDK максимум 1 секунду
        await new Promise<void>((resolve) => {
          let attempts = 0
          const interval = setInterval(() => {
            attempts++
            if (hasMiniAppContext()) {
              clearInterval(interval)
              resolve()
            } else if (attempts >= 10) {
              clearInterval(interval)
              resolve()
            }
          }, 100)
        })
      }

      if (!hasMiniAppContext()) {
        // Не mini app — просто не авторизован
        setFailed(true)
        setReady(true)
        return
      }

      // Повторно вызываем ready() после того как SDK точно загружен
      ;(window as any).Telegram?.WebApp?.ready?.()
      ;(window as any).WebApp?.ready?.()

      const { initData, endpoint } = extractInitData()

      if (!initData || !endpoint) {
        console.warn('[MiniAppAuth] Mini app detected but initData not found')
        setFailed(true)
        setReady(true)
        return
      }

      try {
        const response = await apiClient.post(endpoint, { initData })
        if (response.data.success) {
          const { user } = response.data
          localStorage.setItem('prepodavai_authenticated', 'true')
          localStorage.setItem('prepodavai_user', JSON.stringify({
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Пользователь',
            username: user.username,
            userHash: user.id,
            isAuthenticated: true,
            loginTime: new Date().toISOString()
          }))
          setReady(true)
          return
        }
      } catch (e) {
        console.error('[MiniAppAuth] Auto-login failed:', e)
      }

      setFailed(true)
      setReady(true)
    }

    run()
  }, [])

  return { ready, failed }
}
