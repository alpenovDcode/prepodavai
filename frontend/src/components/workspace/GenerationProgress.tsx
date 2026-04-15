'use client'

import { useEffect, useRef, useState } from 'react'

interface GenerationProgressProps {
    active: boolean
    title?: string
    accentClassName?: string
    messages?: string[]
    estimatedSeconds?: number
}

const DEFAULT_MESSAGES = [
    'Анализируем тему...',
    'Подбираем методические материалы...',
    'Формируем структуру...',
    'Генерируем содержание...',
    'Проверяем соответствие...',
    'Оптимизируем под формат...',
    'Собираем финальный материал...',
    'Форматируем результат...',
    'Почти готово...',
]

export default function GenerationProgress({
    active,
    title = 'Генерируем...',
    accentClassName = 'bg-primary-600',
    messages = DEFAULT_MESSAGES,
    estimatedSeconds = 45,
}: GenerationProgressProps) {
    const [value, setValue] = useState(0)
    const [text, setText] = useState(messages[0])
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        if (active) {
            setValue(0)
            setText(messages[0])
            const tickMs = 1000
            const step = Math.max(1, Math.round((92 / estimatedSeconds) * (tickMs / 1000)))
            intervalRef.current = setInterval(() => {
                setValue((prev) => {
                    const next = prev + step + Math.random() * 2
                    return next >= 92 ? 92 : next
                })
                setText(messages[Math.floor(Math.random() * messages.length)])
            }, tickMs)
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            if (value > 0) {
                setValue(100)
                setText('Готово!')
                const timeout = setTimeout(() => {
                    setValue(0)
                    setText('')
                }, 600)
                return () => clearTimeout(timeout)
            }
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active])

    if (!active && value === 0) return null

    return (
        <div className="flex flex-col items-center justify-center h-full w-full gap-4 px-6 py-8 text-center">
            <div className="max-w-md w-full">
                <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-900">{title}</p>
                    <span className="text-xs font-medium text-gray-500 tabular-nums">{Math.round(value)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${accentClassName} rounded-full transition-all duration-500 ease-out`}
                        style={{ width: `${value}%` }}
                    />
                </div>
                <p className="mt-3 text-sm text-gray-500 min-h-[1.25rem]">{text}</p>
            </div>
        </div>
    )
}
