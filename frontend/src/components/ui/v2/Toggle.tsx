'use client'

import { cn } from '@/lib/utils/cn'

export interface ToggleProps {
    checked: boolean
    onChange: (checked: boolean) => void
    /** Заголовок-описание справа от переключателя. */
    label?: string
    /** Подпись мелким шрифтом под label. */
    description?: string
    disabled?: boolean
    className?: string
}

/**
 * iOS-style переключатель. Используется в настройках уведомлений, фичеффлагах.
 */
export function Toggle({ checked, onChange, label, description, disabled, className }: ToggleProps) {
    const switchEl = (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'relative w-10 h-[22px] rounded-full transition-colors duration-fast ease-out-expo flex-shrink-0',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                checked ? 'bg-brand-500' : 'bg-ink-200',
            )}
        >
            <span
                className={cn(
                    'absolute top-0.5 left-0.5 w-[18px] h-[18px] bg-white rounded-full shadow-xs',
                    'transition-transform duration-fast ease-out-expo',
                    checked && 'translate-x-[18px]',
                )}
            />
        </button>
    )

    if (!label) return <div className={className}>{switchEl}</div>

    return (
        <div className={cn('flex items-start gap-3', className)}>
            <div className="flex-1 pr-4">
                <div className="font-semibold text-ink-900 text-sm">{label}</div>
                {description && <div className="text-xs text-ink-500 mt-0.5 leading-relaxed">{description}</div>}
            </div>
            {switchEl}
        </div>
    )
}
