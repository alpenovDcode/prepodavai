'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

export interface TutorProfileData {
    user: {
        id: string
        firstName: string | null
        lastName: string | null
        avatar: string | null
        subject: string | null
    }
    marketProfile: {
        avgPrice: number
        experience: number
        ratingAvg: number
        ratingCount: number
        dealsCompleted: number
    } | null
    recentRatings: {
        id: string
        score: number
        comment: string | null
        createdAt: string
        rater: { id: string; firstName: string | null; lastName: string | null; avatar: string | null }
    }[]
}

interface State {
    profile: TutorProfileData | null
    isLoading: boolean
    error: string | null
}

export function useTutorProfile(id: string) {
    const [state, setState] = useState<State>({ profile: null, isLoading: true, error: null })

    useEffect(() => {
        let cancelled = false
        apiClient
            .get<TutorProfileData>(`/tutor-exchange/tutors/${id}`)
            .then((r) => {
                if (!cancelled) setState({ profile: r.data, isLoading: false, error: null })
            })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 404) {
                    setState({ profile: null, isLoading: false, error: 'Профиль не найден' })
                } else {
                    setState({
                        profile: null,
                        isLoading: false,
                        error: err?.response?.data?.message || 'Не удалось загрузить профиль',
                    })
                }
            })
        return () => {
            cancelled = true
        }
    }, [id])

    return state
}
