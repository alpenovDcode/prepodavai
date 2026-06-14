'use client'

import { forwardRef, InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    hint?: string
    error?: string
    leftIcon?: ReactNode
    rightIcon?: ReactNode
}

/**
 * Текстовое поле дизайн-системы v2 с поддержкой label / hint / error / icons.
 *
 * @example
 *   <Input label="Тема урока" hint="Чем точнее — тем точнее задания"
 *          leftIcon={<Hash size={16}/>} />
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, hint, error, leftIcon, rightIcon, className, id, ...props },
    ref,
) {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={inputId} className="block text-[13px] font-semibold text-ink-800 mb-1.5">
                    {label}
                </label>
            )}
            <div className="relative">
                {leftIcon && (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none">
                        {leftIcon}
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={cn(
                        'w-full h-10 rounded-md bg-surface text-sm text-ink-900',
                        'border transition-all duration-fast ease-out-expo',
                        'placeholder:text-ink-400',
                        'focus:outline-none focus:ring-[3px]',
                        error
                            ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/15'
                            : 'border-ink-200 focus:border-brand-400 focus:ring-brand-400/15',
                        leftIcon ? 'pl-10' : 'pl-3',
                        rightIcon ? 'pr-10' : 'pr-3',
                        className,
                    )}
                    aria-invalid={!!error}
                    aria-describedby={hint || error ? `${inputId}-hint` : undefined}
                    {...props}
                />
                {rightIcon && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500">
                        {rightIcon}
                    </span>
                )}
            </div>
            {(hint || error) && (
                <p
                    id={`${inputId}-hint`}
                    className={cn(
                        'text-xs mt-1.5',
                        error ? 'text-danger-700' : 'text-ink-500',
                    )}
                >
                    {error || hint}
                </p>
            )}
        </div>
    )
})
