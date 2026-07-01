'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

interface ToolStatus {
    opKey?: string
    enabled: boolean
    message: string
    updatedAt: string | null
}

const POLL_INTERVAL_MS = 30_000

/**
 * Публично опрашивает /system/tool-status?opKey=tutor_exchange.
 * Возвращает enabled=false пока грузится — код ниже должен ориентироваться
 * на isLoading, а не на enabled==false, если это критично для рендера.
 */
export function useTutorExchangeEnabled() {
    const [state, setState] = useState<{ enabled: boolean; message: string; isLoading: boolean }>({
        enabled: false,
        message: '',
        isLoading: true,
    })

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                const resp = await apiClient.get<ToolStatus>('/system/tool-status?opKey=tutor_exchange')
                if (cancelled) return
                setState({
                    enabled: resp.data.enabled,
                    message: resp.data.message,
                    isLoading: false,
                })
            } catch {
                if (cancelled) return
                setState((s) => ({ ...s, isLoading: false }))
            }
        }
        load()
        const id = setInterval(load, POLL_INTERVAL_MS)
        return () => { cancelled = true; clearInterval(id) }
    }, [])

    return state
}
