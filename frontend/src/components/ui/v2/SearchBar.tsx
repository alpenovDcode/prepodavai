'use client'

import { InputHTMLAttributes, forwardRef } from 'react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    /** Подсказка горячей клавиши справа (например '⌘K'). */
    kbdHint?: string
}

/**
 * Поле поиска для topbar или фильтров. С лупой слева и опциональной горячей клавишей справа.
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
    { kbdHint, className, ...props },
    ref,
) {
    return (
        <div className={cn('relative w-full', className)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
            <input
                ref={ref}
                type="text"
                className={cn(
                    'w-full h-9 pl-10 rounded-md text-[13px] bg-ink-100 border border-transparent',
                    'placeholder:text-ink-500',
                    'focus:outline-none focus:bg-surface focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15',
                    'transition-all duration-fast ease-out-expo',
                    kbdHint ? 'pr-12' : 'pr-3',
                )}
                {...props}
            />
            {kbdHint && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-500 bg-surface border border-ink-200 px-1.5 py-0.5 rounded">
                    {kbdHint}
                </span>
            )}
        </div>
    )
})
