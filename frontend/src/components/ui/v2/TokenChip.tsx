'use client'

import { ButtonHTMLAttributes } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface TokenChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Текущий баланс токенов. */
    balance: number
    /** Скрыть метку «токенов» (нужно когда место узкое). */
    compact?: boolean
}

/**
 * Чип баланса токенов для topbar. Кликабельный — ведёт на тарифы / пополнение.
 *
 * @example <TokenChip balance={9375} onClick={() => router.push('/pricing')} />
 */
export function TokenChip({ balance, compact, className, ...props }: TokenChipProps) {
    return (
        <button
            type="button"
            className={cn(
                'inline-flex items-center gap-2 h-9 px-3 rounded-md',
                'bg-gradient-to-br from-brand-50 to-white',
                'border border-brand-200',
                'text-[13px] font-semibold text-brand-700',
                'transition-all duration-fast ease-out-expo',
                'hover:from-brand-100 hover:to-brand-50',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                className,
            )}
            {...props}
        >
            <span className="w-5 h-5 rounded bg-gradient-to-br from-brand-400 to-brand-600 text-white inline-flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3" />
            </span>
            <span className="tnum">{balance.toLocaleString('ru-RU')}</span>
            {!compact && <span className="text-brand-600 font-medium">токенов</span>}
        </button>
    )
}
