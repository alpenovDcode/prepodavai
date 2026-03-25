'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'

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
      if (
        urlParams.has('tgWebAppPlatform') || 
        urlParams.has('max_init_data') || 
        urlParams.has('tgWebAppData')
      ) {
        return true
      }

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
          } else if (attempts >= 5) { // Уменьшаем до 250ms
            clearInterval(interval)
            resolve(false)
          }
        }, 50)
      })
    }

    checkWebApp().then((isApp) => {
      setIsWebApp(isApp)
      if (isApp) {
        // Инициализируем SDK если нужно
        const tg = (window as any).Telegram?.WebApp
        const max = (window as any).WebApp
        tg?.ready?.()
        max?.ready?.()
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

