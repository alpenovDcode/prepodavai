'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'

export interface Subscription {
  creditsBalance: number
  extraCredits: number
  planName?: string
  planId?: string
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const totalCredits = subscription
    ? (subscription.creditsBalance || 0) + (subscription.extraCredits || 0)
    : 0

  const fetchSubscription = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<{ success: boolean; subscription?: Subscription }>('/subscriptions/me')
      
      if (response.data.success && response.data.subscription) {
        setSubscription(response.data.subscription)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Ошибка загрузки подписки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubscription()
  }, [])

  return {
    subscription,
    totalCredits,
    loading,
    error,
    refetch: fetchSubscription
  }
}

