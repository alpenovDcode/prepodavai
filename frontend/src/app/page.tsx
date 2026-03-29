'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { apiClient } from '@/lib/api/client'

// Lazy load heavy LandingPage
const LandingPage = dynamic(() => import('@/components/LandingPage'), {
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
    </div>
  )
})

/**
 * Читает initData из всех возможных источников:
 * 1. window.WebApp.initData (MAX SDK)
 * 2. window.Telegram.WebApp.initData (Telegram SDK)
 * 3. URL hash фрагмент: #WebAppData=... (MAX передаёт сюда данные)
 * 4. URL query params (fallback)
 */
function extractInitData(): { initData: string | null; endpoint: string | null } {
  const tg = (window as any).Telegram?.WebApp
  const max = (window as any).WebApp

  // 1. Telegram SDK
  if (tg?.initData && tg.initData.includes('hash=')) {
    return { initData: tg.initData, endpoint: '/auth/validate-init-data' }
  }

  // 2. MAX SDK
  if (max?.initData && max.initData.includes('hash=')) {
    return { initData: max.initData, endpoint: '/auth/max/validate-init-data' }
  }

  // 3. MAX URL hash фрагмент: #WebAppData=...&WebAppPlatform=...
  const hash = window.location.hash
  if (hash && hash.includes('WebAppData=')) {
    try {
      const hashParams = new URLSearchParams(hash.slice(1)) // убираем #
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

  // 4. URL query params fallback
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

/**
 * Проверяет, открыто ли приложение внутри Telegram/MAX Mini App
 */
function detectMiniApp(): boolean {
  const tg = (window as any).Telegram?.WebApp
  const max = (window as any).WebApp
  const hash = window.location.hash
  const urlParams = new URLSearchParams(window.location.search)

  return !!(
    (tg?.initData) ||
    (max?.initData) ||
    (hash && hash.includes('WebAppData=')) ||
    urlParams.has('tgWebAppPlatform') ||
    urlParams.has('tgWebAppData') ||
    urlParams.has('max_init_data')
  )
}

export default function Home() {
  const [isWebApp, setIsWebApp] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()

  // 1. Немедленная проверка авторизации
  useEffect(() => {
    const auth = localStorage.getItem('prepodavai_authenticated') === 'true'
    setIsAuthenticated(auth)
    if (auth) {
      router.push('/dashboard')
    }
  }, [router])

  // 2. Mini App detection + auto-login
  useEffect(() => {
    const run = async () => {
      // Сразу вызываем ready() — MAX требует это как можно раньше
      // (если не вызвать в течение 15 сек, приложение закроется)
      const tg = (window as any).Telegram?.WebApp
      const max = (window as any).WebApp
      tg?.ready?.()
      max?.ready?.()

      // Проверяем, мы в mini app или нет
      const isMiniApp = detectMiniApp()

      if (!isMiniApp) {
        // Ждём SDK немного (вдруг грузится асинхронно)
        await new Promise<void>((resolve) => {
          let attempts = 0
          const interval = setInterval(() => {
            attempts++
            if (detectMiniApp()) {
              clearInterval(interval)
              resolve()
            } else if (attempts >= 10) {
              clearInterval(interval)
              resolve()
            }
          }, 100)
        })
      }

      const isApp = detectMiniApp()
      setIsWebApp(isApp)

      if (!isApp) return

      // Повторно вызываем ready() после определения контекста
      ;(window as any).Telegram?.WebApp?.ready?.()
      ;(window as any).WebApp?.ready?.()

      // Пробуем авто-логин
      const { initData, endpoint } = extractInitData()

      if (!initData || !endpoint) {
        console.warn('[Home] Mini app detected but initData not found')
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
          setIsAuthenticated(true)
          router.push('/dashboard')
        }
      } catch (e) {
        console.error('[Home] Auto-login failed:', e)
      }
    }

    run()
  }, [])

  // Показываем лоадер пока авторизован и идёт редирект
  if (isAuthenticated === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    )
  }

  // Показываем лоадер пока идёт проверка окружения
  if (isWebApp === null || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    )
  }

  // Гость — показываем лендинг
  return <LandingPage />
}
