'use client'

import { ReactNode, useState } from 'react'
import { cn } from '@/lib/utils/cn'

export interface TooltipProps {
    content: ReactNode
    children: ReactNode
    side?: 'top' | 'right' | 'bottom' | 'left'
    delay?: number
}

/**
 * Простой CSS-only tooltip. Для сложных кейсов (порталы, авто-позиционирование)
 * лучше Radix Tooltip — но для базовых hover-подсказок этого хватит.
 */
export function Tooltip({ content, children, side = 'top', delay = 200 }: TooltipProps) {
    const [open, setOpen] = useState(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    const handleEnter = () => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => setOpen(true), delay)
    }
    const handleLeave = () => {
        if (timer) clearTimeout(timer)
        setOpen(false)
    }

    const positionClass = {
        top:    'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
        bottom: 'top-full    left-1/2 -translate-x-1/2 mt-1.5',
        left:   'right-full  top-1/2  -translate-y-1/2 mr-1.5',
        right:  'left-full   top-1/2  -translate-y-1/2 ml-1.5',
    }[side]

    return (
        <span
            className="relative inline-flex"
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            onFocus={handleEnter}
            onBlur={handleLeave}
        >
            {children}
            {open && (
                <span
                    role="tooltip"
                    className={cn(
                        'absolute z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-ink-900 rounded-md',
                        'whitespace-nowrap pointer-events-none animate-fade-in shadow-md',
                        positionClass,
                    )}
                >
                    {content}
                </span>
            )}
        </span>
    )
}
