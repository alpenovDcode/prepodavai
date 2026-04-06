import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

interface ReferralCode {
  code: string
  link: string
  usageCount: number
  isActive: boolean
  createdAt: string
}

interface ReferralStats {
  totalReferrals: number
  activated: number
  converted: number
  creditsEarned: number
  currentTier: {
    rewardPerReferral: number
    activatedTeachers: number
  }
  milestones: Array<{
    milestone: string
    reward: number
    grantedAt: string
  }>
}

interface ReferralItem {
  id: string
  referredName: string
  referredType: 'teacher' | 'student'
  referralType: string
  status: 'registered' | 'activated' | 'converted'
  rewardGranted: boolean
  conversionRewardGranted: boolean
  createdAt: string
  activatedAt: string | null
  convertedAt: string | null
}

export function useReferralCode() {
  return useQuery({
    queryKey: ['referral-code'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; referralCode: ReferralCode | null }>('/referrals/code')
      return res.data.referralCode
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useReferralStats() {
  return useQuery({
    queryKey: ['referral-stats'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; stats: ReferralStats }>('/referrals/stats')
      return res.data.stats
    },
    staleTime: 1000 * 60 * 2,
  })
}

export function useReferralsList() {
  return useQuery({
    queryKey: ['referrals-list'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; referrals: ReferralItem[] }>('/referrals/list')
      return res.data.referrals
    },
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreateReferralCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (customCode?: string) => {
      const res = await apiClient.post<{ success: boolean; referralCode: ReferralCode }>('/referrals/code', {
        customCode: customCode || undefined,
      })
      return res.data.referralCode
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-code'] })
    },
  })
}

export function useApplyReferralCode() {
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await apiClient.post('/referrals/apply', { code })
      return res.data
    },
  })
}
