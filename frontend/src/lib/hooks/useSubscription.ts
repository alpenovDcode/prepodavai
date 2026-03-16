'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface Subscription {
  creditsBalance: number
  extraCredits: number
  planName?: string
  planId?: string
}

export function useSubscription(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; subscription?: Subscription }>('/subscriptions/me')
      if (!response.data.success || !response.data.subscription) {
        throw new Error('Failed to fetch subscription')
      }
      return response.data.subscription
    },
    enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const totalCredits = data
    ? (data.creditsBalance || 0) + (data.extraCredits || 0)
    : 0

  return {
    subscription: data || null,
    totalCredits,
    loading: isLoading,
    error: error ? (error as any).message : null,
    refetch
  }
}
