'use client'

import { Sparkles } from 'lucide-react'
import { useServiceCosts } from '@/lib/hooks/useServiceCosts'

interface GenerationCostBadgeProps {
    operationType: string
    className?: string
}

export default function GenerationCostBadge({ operationType, className = '' }: GenerationCostBadgeProps) {
    const { costs, isLoading } = useServiceCosts()
    const costConfig = costs?.find(c => c.operationType === operationType)
    const cost = costConfig ? costConfig.creditCost : null
    const isUnderMaintenance = costConfig ? costConfig.isUnderMaintenance : false

    if (isLoading || cost === null) {
        return null
    }

    if (isUnderMaintenance) {
        return (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-200 text-xs font-bold uppercase tracking-wider animate-pulse shadow-sm ${className}`}>
                <i className="fas fa-wrench text-[10px]"></i>
                <span>Тех. работы</span>
            </div>
        )
    }

    const getLabel = (value: number) => {
        if (value === 0) return 'Бесплатно'
        const lastDigit = value % 10
        const lastTwoDigits = value % 100

        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'токенов'
        if (lastDigit === 1) return 'токен'
        if (lastDigit >= 2 && lastDigit <= 4) return 'токена'
        return 'токенов'
    }

    return (
        <div className={`flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-600 rounded-lg border border-purple-100 text-xs font-semibold shadow-sm ${className}`}>
            <Sparkles className="w-3 h-3 text-purple-500" />
            <span>{cost === 0 ? 'Бесплатно' : `${cost} ${getLabel(cost)}`}</span>
        </div>
    )
}
