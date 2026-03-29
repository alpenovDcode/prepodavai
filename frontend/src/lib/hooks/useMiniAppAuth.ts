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

      // initData должен быть непустой строкой с hash внутри
      const hasTgData = tg?.initData && tg.initData.includes('hash=')
      const hasMaxData = max?.initData && max.initData.includes('hash=')

      let initData: string | null = hasTgData ? tg.initData : hasMaxData ? max.initData : null
      let endpoint: string | null = null

      if (hasTgData) {
        endpoint = '/auth/validate-init-data'
      } else if (hasMaxData) {
        endpoint = '/auth/max/validate-init-data'
      } else {
        // Fallback на URL-параметры
        const tgData = urlParams.get('tgWebAppData')
        const maxData = urlParams.get('max_init_data')
        const genericData = urlParams.get('init_data') || urlParams.get('initData')

        if (tgData && tgData.includes('hash=')) {
          initData = tgData
          endpoint = '/auth/validate-init-data'
        } else if (maxData && maxData.includes('hash=')) {
          initData = maxData
          endpoint = '/auth/max/validate-init-data'
        } else if (genericData && genericData.includes('hash=')) {
          initData = genericData
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

    const checkSDK = () => {
      const tg = (window as any).Telegram?.WebApp
      const max = (window as any).WebApp
      return !!((tg?.initData && tg.initData.includes('hash=')) || (max?.initData && max.initData.includes('hash=')))
    }

    if (checkSDK()) {
      // SDK уже готов с валидным initData — логинимся
      tryAutoLogin()
    } else {
      // Ждём SDK максимум 1.5 секунды (15 попыток по 100ms)
      let attempts = 0
      const interval = setInterval(() => {
        attempts++
        if (checkSDK()) {
          clearInterval(interval)
          tryAutoLogin()
        } else if (attempts >= 15) {
          clearInterval(interval)
          // SDK не загрузился или нет initData — не mini app
          setFailed(true)
          setReady(true)
        }
      }, 100)
    }
  }, [])

  return { ready, failed }
}
