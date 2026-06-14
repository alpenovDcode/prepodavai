'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    src?: string | null
    name?: string | null
    initials?: string
    size?: AvatarSize
    /** Цветовая схема. Если не задано, всегда brand-gradient. */
    color?: 'brand' | 'danger' | 'warning' | 'success' | 'info' | 'indigo'
}

const sizeClass: Record<AvatarSize, string> = {
    xs: 'w-6  h-6  text-[10px]',
    sm: 'w-8  h-8  text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
}

const gradientClass: Record<NonNullable<AvatarProps['color']>, string> = {
    brand:   'bg-gradient-to-br from-brand-400 to-brand-600',
    danger:  'bg-gradient-to-br from-red-300 to-red-600',
    warning: 'bg-gradient-to-br from-amber-300 to-amber-600',
    success: 'bg-gradient-to-br from-emerald-300 to-emerald-700',
    info:    'bg-gradient-to-br from-blue-300 to-blue-700',
    indigo:  'bg-gradient-to-br from-indigo-300 to-indigo-700',
}

/**
 * Аватар с инициалами или картинкой. Инициалы берутся из `initials` или из `name` автоматически.
 */
export function Avatar({ src, name, initials, size = 'md', color = 'brand', className, ...props }: AvatarProps) {
    const computedInitials = (initials || nameToInitials(name) || '?').slice(0, 2).toUpperCase()

    return (
        <span
            className={cn(
                'inline-flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 overflow-hidden',
                gradientClass[color],
                sizeClass[size],
                className,
            )}
            aria-label={name ?? undefined}
            {...props}
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={name ?? ''} className="w-full h-full object-cover" />
            ) : (
                computedInitials
            )}
        </span>
    )
}

function nameToInitials(name?: string | null): string {
    if (!name) return ''
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2)
}
