'use client'

import { Star } from 'lucide-react'

interface Props {
    value: number
    onChange?: (value: number) => void
    size?: 'sm' | 'md' | 'lg'
    readOnly?: boolean
}

const SIZE_CLS: Record<NonNullable<Props['size']>, string> = {
    sm: 'w-3.5 h-3.5',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
}

export function StarRating({ value, onChange, size = 'md', readOnly = false }: Props) {
    const cls = SIZE_CLS[size]
    const stars = [1, 2, 3, 4, 5]

    return (
        <div className="inline-flex items-center gap-1">
            {stars.map((n) => {
                const filled = n <= value
                const interactive = !readOnly && onChange
                return (
                    <button
                        key={n}
                        type="button"
                        disabled={!interactive}
                        onClick={() => onChange?.(n)}
                        className={`transition ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}
                        aria-label={`${n} звёзд`}
                    >
                        <Star
                            className={`${cls} ${filled ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
                        />
                    </button>
                )
            })}
        </div>
    )
}
