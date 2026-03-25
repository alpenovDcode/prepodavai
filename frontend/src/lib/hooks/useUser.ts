'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api/client'

export interface UserProfile {
  id: string
  username: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  bio?: string
}

export function useUser() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-me'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; user?: UserProfile }>('/users/me')
      if (!response.data || !response.data.success || !response.data.user) {
        throw new Error('Failed to fetch user profile')
      }
      return response.data.user
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 0, // Не ретраим при 401, так как это скорее всего сессия
    enabled: typeof window !== 'undefined' && !!localStorage.getItem('prepodavai_authenticated'),
  })

  const fullName = isLoading 
    ? 'Загрузка...' 
    : (data ? (`${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || 'Пользователь') : 'Гость')

  const initials = isLoading
    ? '...'
    : (data
        ? (data.firstName && data.lastName 
            ? `${data.firstName[0]}${data.lastName[0]}`.toUpperCase()
            : data.firstName 
              ? data.firstName[0].toUpperCase()
              : data.username 
                ? data.username[0].toUpperCase()
                : 'U')
        : 'G')

  return {
    user: data || null,
    fullName,
    initials,
    loading: isLoading,
    error: error ? (error as any).message : null,
    refetch
  }
}
