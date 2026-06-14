'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export interface TabItem<T extends string = string> {
    id: T
    label: ReactNode
    /** Опциональный счётчик справа от лейбла. */
    count?: number
    icon?: ReactNode
    disabled?: boolean
}

export interface TabsProps<T extends string = string> {
    items: TabItem<T>[]
    active: T
    onChange: (id: T) => void
    /** 'underline' — нижняя полоска (как в class-detail). 'pill' — округлые кнопки (как в каталоге). */
    variant?: 'underline' | 'pill'
    className?: string
}

/**
 * Универсальный компонент табов. Два визуала: underline и pill.
 *
 * @example
 *   <Tabs
 *     items={[{ id: 'all', label: 'Все', count: 7 }, { id: 'done', label: 'Завершено' }]}
 *     active={tab}
 *     onChange={setTab}
 *   />
 */
export function Tabs<T extends string = string>({
    items,
    active,
    onChange,
    variant = 'underline',
    className,
}: TabsProps<T>) {
    if (variant === 'pill') {
        return (
            <div className={cn('flex flex-wrap gap-1.5', className)} role="tablist">
                {items.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={active === item.id}
                        disabled={item.disabled}
                        onClick={() => onChange(item.id)}
                        className={cn(
                            'h-9 px-3.5 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5',
                            'transition-all duration-fast ease-out-expo',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            active === item.id
                                ? 'bg-ink-900 text-white border-ink-900'
                                : 'bg-transparent text-ink-600 border-ink-200 hover:bg-ink-100 hover:text-ink-900',
                        )}
                    >
                        {item.icon}
                        {item.label}
                        {typeof item.count === 'number' && (
                            <span
                                className={cn(
                                    'rounded-full text-[11px] font-bold px-1.5 py-0.5',
                                    active === item.id ? 'bg-white/15' : 'bg-ink-100 text-ink-700',
                                )}
                            >
                                {item.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        )
    }

    // underline variant
    return (
        <div className={cn('flex gap-1 border-b border-ink-200', className)} role="tablist">
            {items.map(item => (
                <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active === item.id}
                    disabled={item.disabled}
                    onClick={() => onChange(item.id)}
                    className={cn(
                        'relative h-10 px-3.5 inline-flex items-center gap-1.5 text-sm font-semibold',
                        'transition-colors duration-fast ease-out-expo',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        active === item.id
                            ? 'text-brand-700'
                            : 'text-ink-500 hover:text-ink-900',
                    )}
                >
                    {item.icon}
                    {item.label}
                    {typeof item.count === 'number' && (
                        <span
                            className={cn(
                                'rounded-full text-[11px] font-bold px-1.5 py-0.5',
                                active === item.id ? 'bg-brand-100 text-brand-700' : 'bg-ink-100 text-ink-600',
                            )}
                        >
                            {item.count}
                        </span>
                    )}
                    {active === item.id && (
                        <span className="absolute inset-x-3 -bottom-px h-0.5 bg-brand-500 rounded-sm" aria-hidden="true" />
                    )}
                </button>
            ))}
        </div>
    )
}
