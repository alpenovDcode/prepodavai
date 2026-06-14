'use client'

import { useCallback } from 'react'
import { track, flush, getAnonId, clearUtm } from '@/lib/analytics/tracker'

/**
 * Удобный хук для трекинга кликов и кастомных событий в React-компонентах.
 *
 * @example
 *   const tracker = useTracker()
 *   <button onClick={() => { tracker.track('click', { eventName: 'cta_register' }) }} />
 */
export function useTracker() {
    const trackEvent = useCallback(
        (eventType: string, opts?: { eventName?: string; payload?: Record<string, any> }) => {
            track(eventType, opts)
        },
        [],
    )

    const trackClick = useCallback(
        (eventName: string, payload?: Record<string, any>) => {
            track('click', { eventName, payload })
        },
        [],
    )

    return {
        track: trackEvent,
        click: trackClick,
        /// Немедленный flush — перед редиректом или window.location.href.
        flush,
        /// Текущий anonId — нужен бэку для claim после регистрации.
        getAnonId,
        /// Очистить UTM после успешной регистрации.
        clearUtm,
    }
}
