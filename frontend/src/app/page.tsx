'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LandingPage from '@/components/LandingPage'
import WebAppIndex from '@/components/WebAppIndex'

export default function Home() {
  const [isTelegram, setIsTelegram] = useState<boolean | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Функция проверки Telegram окружения
    const checkTelegram = async () => {
      // 1. Проверяем URL параметры (самый надежный способ)
      const urlParams = new URLSearchParams(window.location.search)
      if (
        urlParams.has('tgWebAppPlatform') ||
        urlParams.has('tgWebAppVersion') ||
        urlParams.has('tgWebAppData')
      ) {
        return true
      }

      // 2. Проверяем наличие Telegram WebApp SDK
      const checkSDK = () => {
        const tg = (window as any).Telegram?.WebApp
        return !!(
          tg?.initDataUnsafe?.user ||
          tg?.initData ||
          (tg && tg.platform !== 'unknown')
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
    checkTelegram().then((isTg) => {
      setIsTelegram(isTg)

      // Проверяем авторизацию
      const auth = localStorage.getItem('prepodavai_authenticated') === 'true'
      setIsAuthenticated(auth)

      // Если Telegram Mini App, инициализируем
      if (isTg && (window as any).Telegram?.WebApp) {
        const webApp = (window as any).Telegram.WebApp
        webApp.ready()
        webApp.expand()
      }
    })
  }, [])

  // Показываем пустой экран во время проверки
  if (isTelegram === null) {
    return null
  }

  // Показываем лендинг только для веб-пользователей без авторизации
  if (!isTelegram && !isAuthenticated) {
    return <LandingPage />
  }

  return <WebAppIndex />
}

