import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export interface QuestStepInfo {
  step: string
  reward: number
  title: string
  description: string
  completed: boolean
  completedAt: string | null
}

export interface QuestStatus {
  isActive: boolean
  isCompleted: boolean
  expiresAt: string
  completedCount: number
  totalSteps: number
  totalRewardEarned: number
  steps: QuestStepInfo[]
  nextStep: Omit<QuestStepInfo, 'completed' | 'completedAt'> | null
}

export function useOnboardingQuest() {
  return useQuery({
    queryKey: ['onboarding-quest'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; quest: QuestStatus }>(
        '/onboarding-quest/status',
      )
      return res.data.quest
    },
    staleTime: 1000 * 60, // 1 минута
    // Не показываем квест если он неактивен или завершён
    select: (data) => (data?.isActive && !data.isCompleted ? data : null),
  })
}
