'use client'

import { useState, useEffect } from 'react'

interface GenerationProgressProps {
    isGenerating: boolean
}

const MESSAGES = [
    'Анализируем ваш запрос...',
    'Подбираем лучшие материалы...',
    'Генерируем контент...',
    'Структурируем информацию...',
    'Проверяем качество...',
    'Финальная обработка...'
]

export default function GenerationProgress({ isGenerating }: GenerationProgressProps) {
    const [progress, setProgress] = useState(0)
    const [messageIndex, setMessageIndex] = useState(0)

    useEffect(() => {
        if (!isGenerating) {
            setProgress(0)
            setMessageIndex(0)
            return
        }

        // Сброс при начале генерации
        setProgress(0)
        setMessageIndex(0)

        // Эмуляция прогресса (до 90% за 40 секунд)
        const totalDuration = 25000 // 25 секунд
        const updateInterval = 200 // обновление каждые 200мс
        const steps = totalDuration / updateInterval
        const increment = 90 / steps

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) return 90
                return prev + increment
            })
        }, updateInterval)

        // Смена сообщений каждые 5 секунд
        const messageTimer = setInterval(() => {
            setMessageIndex(prev => (prev + 1) % MESSAGES.length)
        }, 5000)

        return () => {
            clearInterval(timer)
            clearInterval(messageTimer)
        }
    }, [isGenerating])

    if (!isGenerating) return null

    return (
        <div className="mt-4 p-6 rounded-2xl bg-white border border-[#D8E6FF] shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="relative w-5 h-5">
                        <div className="absolute inset-0 border-2 border-[#FF7E58]/20 rounded-full"></div>
                        <div className="absolute inset-0 border-2 border-[#FF7E58] rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <span className="font-medium text-gray-900">
                        {MESSAGES[messageIndex]}
                    </span>
                </div>
                <span className="text-sm font-semibold text-[#FF7E58]">
                    {Math.round(progress)}%
                </span>
            </div>

            <div className="h-2 w-full bg-[#F0F5FF] rounded-full overflow-hidden">
                <div
                    className="h-full bg-[#FF7E58] transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                ></div>
            </div>

            <p className="text-xs text-gray-500 mt-3 text-center">
                Обычно это занимает 20-50 секунд. Пожалуйста, не закрывайте страницу.
            </p>
        </div>
    )
}
