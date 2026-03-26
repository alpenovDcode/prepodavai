'use client'

import { useEffect, useState, useMemo } from 'react'
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

export default function Home() {
  const [isWebApp, setIsWebApp] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()

  // 1. Immediate Auth Check
  useEffect(() => {
    const auth = typeof window !== 'undefined' && localStorage.getItem('prepodavai_authenticated') === 'true'
    setIsAuthenticated(auth)
    
    // Если мы уже авторизованы, не ждем Mini App SDK и редиректим сразу
    if (auth) {
      router.push('/dashboard')
    }
  }, [router])

  // 2. WebApp Check (только если не авторизованы или для инициализации SDK)
  useEffect(() => {
    const checkWebApp = async () => {
      // 1. Быстрая проверка параметров URL
      const urlParams = new URLSearchParams(window.location.search)
      const hasParams = urlParams.has('tgWebAppPlatform') || 
                       urlParams.has('max_init_data') || 
                       urlParams.has('tgWebAppData') ||
                       urlParams.has('init_data') ||
                       urlParams.has('initData');
      
      if (hasParams) return true

      // 2. Проверка SDK с коротким ожиданием
      const checkSDK = () => {
        const tg = (window as any).Telegram?.WebApp
        const max = (window as any).WebApp
        return !!(tg?.initData || max?.initData)
      }

      if (checkSDK()) return true

      return new Promise<boolean>((resolve) => {
        let attempts = 0
        const interval = setInterval(() => {
          attempts++
          if (checkSDK()) {
            clearInterval(interval)
            resolve(true)
          } else if (attempts >= 5) { 
            clearInterval(interval)
            resolve(false)
          }
        }, 50)
      })
    }

    const performAutoLogin = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const tg = (window as any).Telegram?.WebApp
      const max = (window as any).WebApp
      
      let initData = tg?.initData || max?.initData
      let endpoint = tg?.initData ? '/auth/validate-init-data' : '/auth/max/validate-init-data'
      
      if (!initData) {
        initData = urlParams.get('tgWebAppData') || urlParams.get('max_init_data') || urlParams.get('init_data') || urlParams.get('initData')
        if (urlParams.get('tgWebAppData')) endpoint = '/auth/validate-init-data'
        else if (urlParams.get('max_init_data')) endpoint = '/auth/max/validate-init-data'
        // If it's just 'initData' without platform, we might need a guess or fallback
      }
      
      if (initData && endpoint) {
        try {
          const response = await apiClient.post(endpoint, { initData })
          if (response.data.success) {
            const { token, user } = response.data
            localStorage.setItem('prepodavai_authenticated', 'true')
            if (token) localStorage.setItem('prepodavai_token', token)
            localStorage.setItem('prepodavai_user', JSON.stringify({
              name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Пользователь',
              username: user.username,
              userHash: user.id,
              isAuthenticated: true,
              loginTime: new Date().toISOString()
            }))
            setIsAuthenticated(true)
            router.push('/dashboard')
            return true
          }
        } catch (e) {
          console.error('[Home] Auto-login failed:', e)
        }
      }
      return false
    }

    checkWebApp().then(async (isApp) => {
      setIsWebApp(isApp)
      if (isApp) {
        const tg = (window as any).Telegram?.WebApp
        const max = (window as any).WebApp
        tg?.ready?.()
        max?.ready?.()
        
        // Попытка авто-входа
        const loggedIn = await performAutoLogin()
        if (!loggedIn && !isAuthenticated) {
          // Если авто-вход не удался, всё равно помечаем что мы в приложении
          // чтобы LoadingPage или LandingPage могли подстроиться если нужно
        }
      }
    })
  }, [])

  // Если мы авторизованы, показываем лоадер пока идет редирект
  if (isAuthenticated === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    )
  }

  // Если идет проверка окружения
  if (isWebApp === null || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    )
  }

  // Показываем лендинг только для гостей
  return <LandingPage />
}

