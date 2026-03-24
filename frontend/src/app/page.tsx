'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import LandingPage from '@/components/LandingPage'
import WebAppIndex from '@/components/WebAppIndex'

export default function Home() {
  const [isWebApp, setIsWebApp] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Функция проверки WebApp окружения (Telegram или MAX)
    const checkWebApp = async () => {
      // 1. Проверяем URL параметры (самый надежный способ)
      const urlParams = new URLSearchParams(window.location.search)
      if (
        urlParams.has('tgWebAppPlatform') ||
        urlParams.has('tgWebAppVersion') ||
        urlParams.has('tgWebAppData') ||
        urlParams.has('max_init_data') || // Possible parameter for MAX
        urlParams.has('auth_date') // Often present in both mini apps
      ) {
        return true
      }

      // 2. Проверяем наличие WebApp SDK
      const checkSDK = () => {
        const tg = (window as any).Telegram?.WebApp
        const max = (window as any).WebApp
        return !!(
          tg?.initDataUnsafe?.user ||
          tg?.initData ||
          (tg && tg.platform !== 'unknown') ||
          (max && typeof max.ready === 'function') ||
          (max && max.initData)
        )
      }

      // Если SDK уже загружен, используем его
      if (checkSDK()) {
        return true
      }

      // 3. Ждем загрузки SDK (максимум 500ms)
      return new Promise<boolean>((resolve) => {
        let attempts = 0
        const maxAttempts = 10
        const interval = setInterval(() => {
          attempts++
          if (checkSDK()) {
            clearInterval(interval)
            resolve(true)
          } else if (attempts >= maxAttempts) {
            clearInterval(interval)
            resolve(false)
          }
        }, 50)
      })
    }

    // Выполняем проверку
    checkWebApp().then((isApp) => {
      setIsWebApp(isApp)

      // Проверяем авторизацию
      const auth = localStorage.getItem('prepodavai_authenticated') === 'true'
      setIsAuthenticated(auth)

      // Если Telegram Mini App, инициализируем
      if (isApp && (window as any).Telegram?.WebApp) {
        const tgApp = (window as any).Telegram.WebApp
        tgApp.ready?.()
        tgApp.expand?.()
      } else if (isApp && (window as any).WebApp) {
        // Инициализируем MAX Web App
        const maxApp = (window as any).WebApp
        maxApp.ready?.()
      }
    })
  }, [])

  // Показываем индикатор загрузки во время проверки окружения
  if (isWebApp === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600" />
      </div>
    )
  }

  // Показываем лендинг только для веб-пользователей без авторизации
  if (!isWebApp && !isAuthenticated) {
    return <LandingPage />
  }

  // Если пользователь авторизован и не в Telegram/MAX, редиректим в дашборд
  if (!isWebApp && isAuthenticated) {
    router.push('/dashboard')
    return null
  }

  return <WebAppIndex />
}

