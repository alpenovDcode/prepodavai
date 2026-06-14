'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { mutate as globalMutate } from 'swr'
import { Bell, Check, CheckCheck, MailOpen } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils/cn'

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

interface Notification {
    id: string
    type: string
    title: string
    message: string
    isRead: boolean
    metadata?: Record<string, any>
    createdAt: string
}

export interface NotificationBellV2Props {
    /** 'teacher' — для дашборда учителя, 'student' — для студента. */
    audience: 'teacher' | 'student'
}

/**
 * Кнопка уведомлений для Topbar v2 — с dropdown списком и счётчиком непрочитанных.
 * Использует существующие /notifications/{audience} + /unread-count + /mark-all-read.
 */
export function NotificationBellV2({ audience }: NotificationBellV2Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    const countUrl = `/notifications/${audience}/unread-count`
    const listUrl = `/notifications/${audience}`

    const { data: countData } = useSWR<{ count: number }>(countUrl, fetcher, { refreshInterval: 30_000 })
    const { data: notifications } = useSWR<Notification[]>(open ? listUrl : null, fetcher)

    const unread = countData?.count ?? 0

    // Закрытие по клику снаружи
    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [open])

    const markOne = async (id: string) => {
        try {
            await apiClient.patch(`/notifications/${audience}/${id}/read`)
            globalMutate(listUrl)
            globalMutate(countUrl)
        } catch { /* ignore */ }
    }

    const markAll = async () => {
        try {
            await apiClient.patch(`/notifications/${audience}/mark-all-read`)
            globalMutate(listUrl)
            globalMutate(countUrl)
        } catch { /* ignore */ }
    }

    const handleClick = (n: Notification) => {
        if (!n.isRead) markOne(n.id)
        setOpen(false)
        // Навигация по metadata
        const meta = n.metadata || {}
        if (n.type === 'submission_received' && meta.assignmentId) {
            router.push(audience === 'teacher' ? `/dashboard/grading?assignment=${meta.assignmentId}` : '/student/grades')
        } else if (n.type === 'submission_graded' && meta.submissionId) {
            router.push('/student/grades')
        }
    }

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="relative w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                aria-label="Уведомления"
            >
                <Bell className="w-[18px] h-[18px]" />
                {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-brand-500 text-white text-[10px] font-bold rounded-full border-2 border-white inline-flex items-center justify-center leading-none tnum">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[90vw] bg-surface rounded-lg border border-ink-200 shadow-2xl z-50 animate-fade-in overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
                        <h3 className="font-display font-bold text-[14px] text-ink-900">Уведомления</h3>
                        {unread > 0 && (
                            <button
                                type="button"
                                onClick={markAll}
                                className="text-[12px] font-semibold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                            >
                                <CheckCheck className="w-3.5 h-3.5" />
                                Прочитать все
                            </button>
                        )}
                    </div>

                    <div className="max-h-[420px] overflow-y-auto">
                        {!notifications ? (
                            <div className="px-4 py-8 text-center text-ink-500 text-[13px]">Загрузка…</div>
                        ) : notifications.length === 0 ? (
                            <div className="px-4 py-10 text-center text-ink-500">
                                <MailOpen className="w-8 h-8 mx-auto text-ink-300 mb-2" />
                                <div className="text-[13px]">Пока нет уведомлений</div>
                            </div>
                        ) : (
                            <ul className="divide-y divide-ink-100">
                                {notifications.map(n => (
                                    <li key={n.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleClick(n)}
                                            className={cn(
                                                'w-full text-left px-4 py-3 flex gap-3 hover:bg-ink-50 transition-colors',
                                                !n.isRead && 'bg-brand-50/50',
                                            )}
                                        >
                                            {!n.isRead && (
                                                <span className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                                            )}
                                            <div className={cn('flex-1 min-w-0', n.isRead && 'pl-[14px]')}>
                                                <div className="font-bold text-[13px] text-ink-900 truncate">{n.title}</div>
                                                <div className="text-[12px] text-ink-600 mt-0.5 line-clamp-2">{n.message}</div>
                                                <div className="text-[11px] text-ink-400 mt-1">
                                                    {formatRelative(n.createdAt)}
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function formatRelative(iso: string): string {
    const d = new Date(iso)
    const sec = (Date.now() - d.getTime()) / 1000
    if (sec < 60) return 'только что'
    if (sec < 3600) return `${Math.round(sec / 60)} мин назад`
    if (sec < 86400) return `${Math.round(sec / 3600)} ч назад`
    return d.toLocaleDateString('ru-RU')
}
