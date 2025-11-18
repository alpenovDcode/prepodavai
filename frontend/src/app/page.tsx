'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LandingPage from '@/components/LandingPage'
import WebAppIndex from '@/components/WebAppIndex'

export default function Home() {
  const [isTelegram, setIsTelegram] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Проверяем, запущено ли в Telegram Mini App
    const checkTelegram = () => {
      const tg = (window as any).Telegram?.WebApp
      return !!(
        tg?.initDataUnsafe?.user ||
        tg?.initData ||
        window.location.search.includes('tgWebAppPlatform') ||
        (tg && tg.platform !== 'unknown')
      )
    }

    const tg = checkTelegram()
    setIsTelegram(tg)

    // Проверяем авторизацию
    const auth = localStorage.getItem('prepodavai_authenticated') === 'true'
    setIsAuthenticated(auth)

    // Если Telegram Mini App, инициализируем
    if (tg && (window as any).Telegram?.WebApp) {
      const webApp = (window as any).Telegram.WebApp
      webApp.ready()
      webApp.expand()
    }
  }, [])

  // Показываем лендинг только для веб-пользователей без авторизации
  if (!isTelegram && !isAuthenticated) {
    return <LandingPage />
  }

  return <WebAppIndex />
}

