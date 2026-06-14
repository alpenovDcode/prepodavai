'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { track, captureUtm, getAnonId } from '@/lib/analytics/tracker'

/**
 * Автоматический tracker для воронок. Подключается один раз в root layout.
 *
 * Что делает:
 *   1. При первой загрузке создаёт `anonId` cookie + захватывает UTM из URL.
 *   2. На каждом изменении pathname шлёт событие `page_view` с путём и UTM.
 *   3. Помечает повторный page_view одним и тем же путём, чтобы не дублировать
 *      события при `Next.js`-перерендере (StrictMode dev).
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const search = useSearchParams()
    const lastPathRef = useRef<string | null>(null)

    useEffect(() => {
        // Инициализация — создаст cookie и захватит UTM из текущего URL.
        getAnonId()
        captureUtm()
    }, [])

    useEffect(() => {
        if (!pathname) return
        // Сюда теоретически можно прокидывать `search.toString()`, но для воронок
        // обычно важнее путь (без query, чтобы /dashboard ≠ /dashboard?tab=2).
        const fullPath = pathname
        if (lastPathRef.current === fullPath) return
        lastPathRef.current = fullPath

        track('page_view', {
            eventName: fullPath,
            payload: {
                title: typeof document !== 'undefined' ? document.title : null,
                query: search?.toString() || null,
            },
        })
    }, [pathname, search])

    return <>{children}</>
}
