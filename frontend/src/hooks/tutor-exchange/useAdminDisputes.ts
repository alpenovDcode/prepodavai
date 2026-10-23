'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

interface Person {
    id: string
    firstName: string | null
    lastName: string | null
}

export interface AdminDispute {
    id: string
    status: string
    createdAt: string
    paymentDeadline: string | null
    lead: {
        id: string
        subject: string
        grade: string
        type: 'FREE' | 'COMMISSION'
        price: number
        creatorId: string
        creator: Person
    }
    responder: Person & { marketProfile?: { disabledAt: string | null } | null }
    reports: {
        id: string
        description: string
        status: string
        createdAt: string
        reporter: Person
    }[]
}

export function useAdminDisputes() {
    const [items, setItems] = useState<AdminDispute[]>([])
    const [isLoading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const r = await apiClient.get<AdminDispute[]>('/admin/tutor-exchange/disputes')
            setItems(r.data)
            setError(null)
        } catch (err: any) {
            setError(err?.response?.data?.message || 'Не удалось загрузить споры')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    return { items, isLoading, error, reload: load }
}
