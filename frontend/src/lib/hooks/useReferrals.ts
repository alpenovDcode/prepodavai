import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export interface ReferralCode {
  code: string
  link: string
  usageCount: number
  isActive: boolean
  createdAt: string
}

export interface ReferralTier {
  id: string
  label: string
  required: number
  current: number
  status: 'unlocked' | 'progress' | 'locked'
}

export interface ReferralStats {
  // V2 UI
  code: string | null
  shareUrl: string | null
  totalInvited: number
  monthlyDelta: number
  exclusiveMaterials: number
  webinarsAvailable: number
  nextWebinarAt: string | null
  tiers: ReferralTier[]
  // Legacy
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

export interface ReferralListItem {
  id: string
  name: string
  registeredAt: string
  materialsCreated: number
  status: 'master' | 'active' | 'pending'
  contributedTiers: string[]
}

export interface ReferralListResponse {
  items: ReferralListItem[]
  total: number
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
      const res = await apiClient.get<{ success: boolean; referrals: ReferralListResponse }>('/referrals/list')
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
      queryClient.invalidateQueries({ queryKey: ['referral-stats'] })
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
