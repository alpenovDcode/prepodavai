'use client'

import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    /** Делает карточку кликабельной (cursor + hover-эффект). */
    interactive?: boolean
    /** Внутренний отступ. По умолчанию 'md' (24px). */
    padding?: 'none' | 'sm' | 'md' | 'lg'
    /** Усиленный визуал — slightly elevated. */
    elevated?: boolean
}

const paddingClass = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' }

/**
 * Базовая карточка дизайн-системы v2.
 * Белый фон, тонкий бордер, скруглённые углы.
 * Используется как контейнер для KPI, виджетов, форм, и т.д.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { interactive, padding = 'md', elevated, className, ...props },
    ref,
) {
    return (
        <div
            ref={ref}
            className={cn(
                'bg-surface border border-ink-200 rounded-lg',
                'transition-all duration-fast ease-out-expo',
                paddingClass[padding],
                elevated && 'shadow-sm',
                interactive && 'cursor-pointer hover:border-ink-300 hover:shadow-md',
                className,
            )}
            {...props}
        />
    )
})
