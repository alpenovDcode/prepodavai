'use client'

import { forwardRef, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export type BadgeVariant = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant
    icon?: ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
    brand:   'bg-brand-50   text-brand-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger:  'bg-danger-50  text-danger-700',
    info:    'bg-info-50    text-info-700',
    neutral: 'bg-ink-100    text-ink-600',
}

/**
 * Маленький pill-бейдж для статусов и меток.
 *
 * @example <Badge variant="success" icon={<Check size={12}/>}>готово</Badge>
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
    { variant = 'neutral', icon, className, children, ...props },
    ref,
) {
    return (
        <span
            ref={ref}
            className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-none',
                variantClass[variant],
                className,
            )}
            {...props}
        >
            {icon}
            {children}
        </span>
    )
})
