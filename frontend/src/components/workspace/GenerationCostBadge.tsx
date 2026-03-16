'use client'

import { Sparkles } from 'lucide-react'
import { useServiceCosts } from '@/lib/hooks/useServiceCosts'

interface GenerationCostBadgeProps {
    operationType: string
    className?: string
}

export default function GenerationCostBadge({ operationType, className = '' }: GenerationCostBadgeProps) {
    const { getCost, isLoading } = useServiceCosts()
    const cost = getCost(operationType)

    if (isLoading || cost === null) {
        return null
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
