'use client'

import { forwardRef, SelectHTMLAttributes, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SelectOption {
    value: string
    label: string
    disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
    label?: string
    hint?: string
    error?: string
    options: SelectOption[]
    placeholder?: string
}

/**
 * Native-select с дизайн-системой v2. Простой и доступный (полноценная клавиатура).
 *
 * @example
 *   <Select label="Класс" options={[{value:'10A',label:'10А'}, ...]} />
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { label, hint, error, options, placeholder, className, id, ...props },
    ref,
) {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={selectId} className="block text-[13px] font-semibold text-ink-800 mb-1.5">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    id={selectId}
                    className={cn(
                        'w-full h-10 pl-3 pr-10 rounded-md bg-surface text-sm text-ink-900',
                        'border appearance-none cursor-pointer transition-all duration-fast ease-out-expo',
                        'focus:outline-none focus:ring-[3px]',
                        error
                            ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/15'
                            : 'border-ink-200 focus:border-brand-400 focus:ring-brand-400/15',
                        className,
                    )}
                    aria-invalid={!!error}
                    {...props}
                >
                    {placeholder && <option value="">{placeholder}</option>}
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
            </div>
            {(hint || error) && (
                <p className={cn('text-xs mt-1.5', error ? 'text-danger-700' : 'text-ink-500')}>
                    {error || hint}
                </p>
            )}
        </div>
    )
})
