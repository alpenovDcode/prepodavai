'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

export interface AdminViolation {
    id: string
    dialogId: string
    reporterId: string
    description: string
    status: 'PENDING' | 'RESOLVED' | 'DISMISSED'
    createdAt: string
    dialog: {
        id: string
        status: string
        lead: {
            id: string
            subject: string
            creator: { id: string; firstName: string | null; lastName: string | null }
        }
        responder: {
            id: string
            firstName: string | null
            lastName: string | null
            marketProfile?: { disabledAt: string | null } | null
        }
    }
    reporter: { id: string; firstName: string | null; lastName: string | null; email: string | null }
}

export function useAdminViolations(status?: string) {
    const [items, setItems] = useState<AdminViolation[]>([])
    const [isLoading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const qs = status ? `?status=${status}` : ''
            const r = await apiClient.get<AdminViolation[]>(`/admin/tutor-exchange/violations${qs}`)
            setItems(r.data)
            setError(null)
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось загрузить жалобы')
        } finally {
            setLoading(false)
        }
    }, [status])

    useEffect(() => {
        load()
    }, [load])

    return { items, isLoading, error, reload: load }
}
