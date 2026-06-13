'use client'

import { useEffect, useState } from 'react'
import axios from 'axios'

interface MaintenanceStatus {
    enabled: boolean
    message: string
}

const POLL_INTERVAL_MS = 30_000

/**
 * Глобальная заглушка «Ведутся технические работы». Опрашивает
 * /system/maintenance каждые 30 секунд. Если включено — закрывает приложение
 * полноэкранным сообщением.
 *
 * Админ распознаётся серверно: бэкенд возвращает 503 только не-админам, поэтому
 * запросы под админом проходят как обычно. Для самой заглушки админ виден через
 * статус (он же доступен публично) — мы ВРУЧНУЮ скрываем оверлей, если
 * пользователь сидит в /admin/* (там работает админ).
 */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<MaintenanceStatus | null>(null)
    const [isAdminRoute, setIsAdminRoute] = useState(false)

    useEffect(() => {
        if (typeof window === 'undefined') return
        setIsAdminRoute(window.location.pathname.startsWith('/admin'))

        const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
        const url = `${apiBase}/api/system/maintenance`

        let cancelled = false
        const load = async () => {
            try {
                const resp = await axios.get<MaintenanceStatus>(url, { timeout: 8000 })
                if (cancelled) return
                setStatus(resp.data)
            } catch {
                /* нет связи / endpoint недоступен — не блокируем UI */
            }
        }
        load()
        const id = setInterval(load, POLL_INTERVAL_MS)

        // Если в этой же вкладке поменяли путь (Next router) — переоцениваем
        // признак админ-страницы. На full reload работает useEffect выше.
        const onPath = () => setIsAdminRoute(window.location.pathname.startsWith('/admin'))
        window.addEventListener('popstate', onPath)

        return () => {
            cancelled = true
            clearInterval(id)
            window.removeEventListener('popstate', onPath)
        }
    }, [])

    if (!status?.enabled || isAdminRoute) return <>{children}</>

    return (
        <div className="fixed inset-0 z-[10000] bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 sm:p-10 text-center border border-gray-100">
                <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-orange-50 flex items-center justify-center">
                    <span className="text-3xl">🛠️</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                    Технические работы
                </h1>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {status.message}
                </p>
                <p className="text-xs text-gray-400 mt-6">
                    Страница обновится автоматически, когда сервис вернётся в строй.
                </p>
            </div>
        </div>
    )
}
