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
      if (!response.data.success || !response.data.user) {
        throw new Error('Failed to fetch user profile')
      }
      return response.data.user
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    retry: 1,
  })

  const fullName = data 
    ? (`${data.firstName || ''} ${data.lastName || ''}`.trim() || data.username || 'Неизвестный')
    : 'Неизвестный'

  const initials = data
    ? (data.firstName && data.lastName 
        ? `${data.firstName[0]}${data.lastName[0]}`.toUpperCase()
        : data.firstName 
          ? data.firstName[0].toUpperCase()
          : data.username 
            ? data.username[0].toUpperCase()
            : 'U')
    : 'U'

  return {
    user: data || null,
    fullName,
    initials,
    loading: isLoading,
    error: error ? (error as any).message : null,
    refetch
  }
}
