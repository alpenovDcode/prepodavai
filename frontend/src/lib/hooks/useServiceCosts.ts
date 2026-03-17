'use client'

import useSWR from 'swr'
import { apiClient } from '../api/client'

const fetcher = (url: string) => apiClient.get(url).then(res => res.data.costs)

export interface CreditCost {
    operationType: string
    operationName: string
    creditCost: number
    description: string
    isUnderMaintenance: boolean
}

export function useServiceCosts() {
    const { data: costs, error, isLoading } = useSWR<CreditCost[]>('/subscriptions/costs', fetcher, {
        revalidateOnFocus: true,
        dedupingInterval: 0 // Disable cache for now to reflect DB changes
    })

    const getCost = (operationType: string): number | null => {
        if (!costs) return null
        const cost = costs.find(c => c.operationType === operationType)
        return cost ? cost.creditCost : null
    }

    return {
        costs,
        getCost,
        isLoading,
        error
    }
}
