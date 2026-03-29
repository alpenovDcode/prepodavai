'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'

/**
 * Хук для авто-логина из Telegram/MAX Mini App.
 * Если пользователь уже авторизован — возвращает { ready: true } мгновенно.
 * Если нет, но есть initData от SDK — выполняет авто-логин через бэкенд.
 * Если ни того ни другого — возвращает { ready: true, failed: true }.
 */
export function useMiniAppAuth() {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Уже авторизован — ничего не делаем
    if (localStorage.getItem('prepodavai_authenticated') === 'true') {
      setReady(true)
      return
    }

    const tryAutoLogin = async () => {
      // Определяем SDK и initData
      const tg = (window as any).Telegram?.WebApp
      const max = (window as any).WebApp
      const urlParams = new URLSearchParams(window.location.search)

      let initData: string | null = tg?.initData || max?.initData || null
      let endpoint: string | null = null

      if (tg?.initData) {
        endpoint = '/auth/validate-init-data'
      } else if (max?.initData) {
        endpoint = '/auth/max/validate-init-data'
      } else {
        // Fallback на URL-параметры
        const tgData = urlParams.get('tgWebAppData')
        const maxData = urlParams.get('max_init_data')
        const genericData = urlParams.get('init_data') || urlParams.get('initData')

        if (tgData) {
          initData = tgData
          endpoint = '/auth/validate-init-data'
        } else if (maxData) {
          initData = maxData
          endpoint = '/auth/max/validate-init-data'
        } else if (genericData) {
          initData = genericData
          // Определяем по платформе
          endpoint = urlParams.has('tgWebAppPlatform')
            ? '/auth/validate-init-data'
            : '/auth/max/validate-init-data'
        }
      }

      if (!initData || !endpoint) {
        setFailed(true)
        setReady(true)
        return
      }

      // Вызываем ready() у SDK
      tg?.ready?.()
      max?.ready?.()

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

    // Ждём SDK с короткой задержкой
    const isMiniAppUrl = () => {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.has('tgWebAppPlatform') ||
        urlParams.has('max_init_data') ||
        urlParams.has('tgWebAppData') ||
        urlParams.has('init_data') ||
        urlParams.has('initData')
    }

    const checkSDK = () => {
      const tg = (window as any).Telegram?.WebApp
      const max = (window as any).WebApp
      return !!(tg?.initData || max?.initData)
    }

    if (checkSDK() || isMiniAppUrl()) {
      // SDK уже готов или есть параметры — пробуем сразу
      tryAutoLogin()
    } else {
      // Ждём SDK максимум 250ms (5 попыток по 50ms)
      let attempts = 0
      const interval = setInterval(() => {
        attempts++
        if (checkSDK()) {
          clearInterval(interval)
          tryAutoLogin()
        } else if (attempts >= 5) {
          clearInterval(interval)
          // Не mini app — просто не авторизован
          setFailed(true)
          setReady(true)
        }
      }, 50)
    }
  }, [])

  return { ready, failed }
}
