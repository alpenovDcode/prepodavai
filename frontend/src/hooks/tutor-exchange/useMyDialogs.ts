'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

export interface DialogListItem {
    id: string
    leadId: string
    responderId: string
    status: 'OPEN' | 'TRIAL_PENDING' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'DISPUTED'
    createdAt: string
    closedAt: string | null
    paymentDeadline: string | null
    lead: {
        id: string
        subject: string
        grade: string
        creatorId: string
        status: string
        creator: { id: string; firstName?: string | null; lastName?: string | null; avatar?: string | null }
    }
    responder: { id: string; firstName?: string | null; lastName?: string | null; avatar?: string | null }
}

interface State {
    dialogs: DialogListItem[]
    isLoading: boolean
    error: string | null
    disabled: boolean
    disabledMessage?: string
}

export function useMyDialogs() {
    const [state, setState] = useState<State>({
        dialogs: [],
        isLoading: true,
        error: null,
        disabled: false,
    })

    useEffect(() => {
        let cancelled = false
        apiClient
            .get<DialogListItem[]>('/tutor-exchange/dialogs')
            .then((r) => {
                if (cancelled) return
                setState({ dialogs: r.data, isLoading: false, error: null, disabled: false })
            })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) {
                    setState({
                        dialogs: [],
                        isLoading: false,
                        error: null,
                        disabled: true,
                        disabledMessage: err.response.data.message,
                    })
                } else {
                    setState({
                        dialogs: [],
                        isLoading: false,
                        error: err?.response?.data?.message || 'Не удалось загрузить диалоги',
                        disabled: false,
                    })
                }
            })
        return () => {
            cancelled = true
        }
    }, [])

    return state
}
