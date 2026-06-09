'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { X } from 'lucide-react'

interface Popup {
    id: string
    title?: string | null
    body: string
    ctaText?: string | null
    ctaUrl?: string | null
    delaySeconds: number
}

/**
 * Превращает текст в JSX: сохраняет переносы строк, кликабельные URL.
 * Не использует innerHTML, чтобы безопасно отображать пользовательский ввод
 * от админа без XSS.
 */
function renderBodyWithLinks(text: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const lines = text.split('\n')
    return lines.map((line, lineIdx) => {
        const parts: (string | JSX.Element)[] = []
        let lastIndex = 0
        let match: RegExpExecArray | null
        const re = new RegExp(urlRegex.source, 'g')
        let i = 0
        while ((match = re.exec(line)) !== null) {
            if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index))
            const url = match[0]
            parts.push(
                <a
                    key={`l${lineIdx}-${i++}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#FF7E58] hover:underline break-all"
                >
                    {url}
                </a>,
            )
            lastIndex = match.index + url.length
        }
        if (lastIndex < line.length) parts.push(line.slice(lastIndex))
        return (
            <span key={lineIdx}>
                {parts}
                {lineIdx < lines.length - 1 && <br />}
            </span>
        )
    })
}

export default function DashboardPopup() {
    const [popup, setPopup] = useState<Popup | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        let cancelled = false
        let showTimer: ReturnType<typeof setTimeout> | null = null

        apiClient
            .get<Popup | null>('/popups/active')
            .then((resp) => {
                if (cancelled) return
                const data = resp.data
                if (!data || !data.id) return
                // Локальный кэш закрытых — на случай если сервер недоступен.
                const dismissed = JSON.parse(localStorage.getItem('dismissed_popups') || '[]')
                if (Array.isArray(dismissed) && dismissed.includes(data.id)) return
                setPopup(data)
                const delayMs = Math.max(0, (data.delaySeconds ?? 5) * 1000)
                showTimer = setTimeout(() => {
                    if (!cancelled) setVisible(true)
                }, delayMs)
            })
            .catch(() => {
                /* нет активных popup'ов или нет авторизации — тихо */
            })

        return () => {
            cancelled = true
            if (showTimer) clearTimeout(showTimer)
        }
    }, [])

    const close = async () => {
        if (!popup) return
        setVisible(false)
        try {
            await apiClient.post(`/popups/${popup.id}/dismiss`)
        } catch {
            // Сохраняем локально как фолбэк
        }
        try {
            const dismissed = JSON.parse(localStorage.getItem('dismissed_popups') || '[]')
            const arr = Array.isArray(dismissed) ? dismissed : []
            if (!arr.includes(popup.id)) arr.push(popup.id)
            localStorage.setItem('dismissed_popups', JSON.stringify(arr.slice(-100)))
        } catch {}
    }

    if (!popup || !visible) return null

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4 animate-fade-in"
            onClick={close}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 sm:p-7 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={close}
                    aria-label="Закрыть"
                    className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                >
                    <X className="w-5 h-5" />
                </button>

                {popup.title && (
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 pr-8">
                        {popup.title}
                    </h3>
                )}

                <div className="text-sm sm:text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {renderBodyWithLinks(popup.body)}
                </div>

                <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                    {popup.ctaUrl && popup.ctaText && (
                        <a
                            href={popup.ctaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => { void close() }}
                            className="px-5 py-2.5 bg-[#FF7E58] hover:bg-[#FF6B40] text-white rounded-xl font-semibold text-sm text-center transition"
                        >
                            {popup.ctaText}
                        </a>
                    )}
                    <button
                        onClick={close}
                        className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition"
                    >
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    )
}
