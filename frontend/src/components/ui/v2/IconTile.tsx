'use client'

import { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

export type IconTileColor = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'indigo' | 'teal' | 'pink' | 'neutral'
export type IconTileSize = 'sm' | 'md' | 'lg'

export interface IconTileProps extends HTMLAttributes<HTMLSpanElement> {
    color?: IconTileColor
    size?: IconTileSize
    children: ReactNode
}

/**
 * Цветная плитка для иконок (KPI cards, list items, tool cards).
 * Используется на главной, в каталоге инструментов, в settings.
 */
const colorClass: Record<IconTileColor, string> = {
    brand:   'bg-brand-50   text-brand-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger:  'bg-danger-50  text-danger-700',
    info:    'bg-info-50    text-info-700',
    indigo:  'bg-indigo-50  text-indigo-700',
    teal:    'bg-teal-50    text-teal-700',
    pink:    'bg-pink-50    text-pink-700',
    neutral: 'bg-ink-100    text-ink-700',
}

const sizeClass: Record<IconTileSize, string> = {
    sm: 'w-7  h-7  rounded',
    md: 'w-9  h-9  rounded-md',
    lg: 'w-11 h-11 rounded-md',
}

export function IconTile({ color = 'brand', size = 'md', className, children, ...props }: IconTileProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center justify-center flex-shrink-0',
                colorClass[color],
                sizeClass[size],
                className,
            )}
            {...props}
        >
            {children}
        </span>
    )
}
