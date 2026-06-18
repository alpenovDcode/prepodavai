'use client'

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    leftIcon?: ReactNode
    rightIcon?: ReactNode
    loading?: boolean
    fullWidth?: boolean
}

const variantClass: Record<ButtonVariant, string> = {
    primary:   'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
    secondary: 'bg-surface text-ink-700 border border-ink-200 hover:bg-ink-50 hover:border-ink-300',
    ghost:     'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900',
    danger:    'bg-danger-500 text-white hover:bg-danger-700',
}

const sizeClass: Record<ButtonSize, string> = {
    sm: 'h-9 min-h-[36px] px-3  text-[13px] gap-1.5',
    md: 'h-10 px-4  text-sm    gap-2',
    lg: 'h-12 px-6  text-[15px] gap-2 rounded-lg',
}

/**
 * Универсальная кнопка из дизайн-системы redesign-v2.
 *
 * @example <Button variant="primary" leftIcon={<Sparkles size={16}/>}>Сгенерировать</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = 'primary', size = 'md', leftIcon, rightIcon, loading, fullWidth, className, children, disabled, ...props },
    ref,
) {
    return (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cn(
                'inline-flex items-center justify-center rounded-md font-semibold whitespace-nowrap',
                'transition-all duration-fast ease-out-expo',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1',
                variantClass[variant],
                sizeClass[size],
                fullWidth && 'w-full',
                className,
            )}
            {...props}
        >
            {loading ? <Spinner /> : leftIcon}
            {children}
            {!loading && rightIcon}
        </button>
    )
})

function Spinner() {
    return (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
    )
}
