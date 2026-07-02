'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/api/client'

export interface DialogMessage {
    id: string
    dialogId: string
    senderId: string | null
    content: string
    flagged: boolean
    isSystem: boolean
    createdAt: string
}

export interface DialogDetails {
    id: string
    status: 'OPEN' | 'TRIAL_PENDING' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'DISPUTED'
    responderId: string
    createdAt: string
    closedAt: string | null
    paymentDeadline: string | null
    lead: {
        id: string
        subject: string
        grade: string
        format: 'ONLINE' | 'OFFLINE'
        city?: string | null
        description: string
        type: 'FREE' | 'COMMISSION'
        price: number
        status: string
        studentContact?: string
        creatorId: string
        creator: { id: string; firstName?: string | null; lastName?: string | null; avatar?: string | null }
    }
    responder: { id: string; firstName?: string | null; lastName?: string | null; avatar?: string | null }
    messages: DialogMessage[]
}

interface State {
    dialog: DialogDetails | null
    isLoading: boolean
    error: string | null
    disabled: boolean
    disabledMessage?: string
}

const POLL_MS = 3000

export function useDialog(id: string) {
    const [state, setState] = useState<State>({
        dialog: null,
        isLoading: true,
        error: null,
        disabled: false,
    })
    const cancelledRef = useRef(false)

    const load = useCallback(async () => {
        try {
            const r = await apiClient.get<DialogDetails>(`/tutor-exchange/dialogs/${id}`)
            if (cancelledRef.current) return
            setState({ dialog: r.data, isLoading: false, error: null, disabled: false })
        } catch (err: any) {
            if (cancelledRef.current) return
            if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) {
                setState({
                    dialog: null,
                    isLoading: false,
                    error: null,
                    disabled: true,
                    disabledMessage: err.response.data.message,
                })
            } else if (err?.response?.status === 404) {
                setState({ dialog: null, isLoading: false, error: 'Диалог не найден', disabled: false })
            } else if (err?.response?.status === 403) {
                setState({ dialog: null, isLoading: false, error: 'Нет доступа к диалогу', disabled: false })
            } else {
                setState({
                    dialog: null,
                    isLoading: false,
                    error: err?.response?.data?.message || 'Ошибка загрузки',
                    disabled: false,
                })
            }
        }
    }, [id])

    useEffect(() => {
        cancelledRef.current = false
        load()
        let intervalId: ReturnType<typeof setInterval> | null = null
        const start = () => {
            if (intervalId) return
            intervalId = setInterval(load, POLL_MS)
        }
        const stop = () => {
            if (intervalId) {
                clearInterval(intervalId)
                intervalId = null
            }
        }
        start()
        const onVis = () => {
            if (document.visibilityState === 'hidden') stop()
            else start()
        }
        document.addEventListener('visibilitychange', onVis)
        return () => {
            cancelledRef.current = true
            stop()
            document.removeEventListener('visibilitychange', onVis)
        }
    }, [load])

    return { ...state, reload: load }
}
