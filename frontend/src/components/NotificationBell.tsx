'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCheck, GraduationCap, Send, X } from 'lucide-react'
import { apiClient } from '@/lib/api/client'

interface Notification {
    id: string
    type: 'submission_received' | 'submission_graded'
    title: string
    message: string
    isRead: boolean
    metadata?: {
        assignmentId?: string
        submissionId?: string
        grade?: number
        studentName?: string
        lessonTitle?: string
    }
    createdAt: string
}

interface NotificationBellProps {
    userType: 'teacher' | 'student'
    studentId?: string // required when userType === 'student'
}

export default function NotificationBell({ userType, studentId }: NotificationBellProps) {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const fetchNotifications = async () => {
        try {
            const [notifsRes, countRes] = await Promise.all([
                apiClient.get(`/notifications/${userType}`),
                apiClient.get(`/notifications/${userType}/unread-count`),
            ])
            setNotifications(notifsRes.data)
            setUnreadCount(countRes.data.count)
        } catch {
            // ignore errors silently — bell is non-critical
        }
    }

    useEffect(() => {
        fetchNotifications()
        const interval = setInterval(fetchNotifications, 30000)
        return () => clearInterval(interval)
    }, [userType])

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleOpen = async () => {
        setIsOpen((prev) => !prev)
    }

    const markAllRead = async () => {
        try {
            await apiClient.patch(`/notifications/${userType}/mark-all-read`)
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
            setUnreadCount(0)
        } catch {}
    }

    const markOneRead = async (id: string) => {
        try {
            await apiClient.patch(`/notifications/${userType}/${id}/read`)
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
            )
            setUnreadCount((prev) => Math.max(0, prev - 1))
        } catch {}
    }

    const getIcon = (type: string) => {
        if (type === 'submission_received') return <Send size={14} className="text-blue-500" />
        if (type === 'submission_graded') return <GraduationCap size={14} className="text-green-500" />
        return <Bell size={14} className="text-gray-400" />
    }

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMin = Math.floor(diffMs / 60000)
        if (diffMin < 1) return 'только что'
        if (diffMin < 60) return `${diffMin} мин назад`
        const diffH = Math.floor(diffMin / 60)
        if (diffH < 24) return `${diffH} ч назад`
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={handleOpen}
                className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
                aria-label="Уведомления"
            >
                <Bell size={20} className="text-gray-600" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h3 className="font-bold text-gray-900 text-sm">Уведомления</h3>
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllRead}
                                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    <CheckCheck size={14} /> Прочитать все
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <X size={14} className="text-gray-400" />
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="py-10 text-center">
                                <Bell size={28} className="text-gray-200 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">Уведомлений пока нет</p>
                            </div>
                        ) : (
                            notifications.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => !n.isRead && markOneRead(n.id)}
                                    className={`flex gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${!n.isRead ? 'bg-blue-50/40' : ''}`}
                                >
                                    <div className="mt-0.5 flex-shrink-0">
                                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                                            {getIcon(n.type)}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                            {n.title}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                                        <p className="text-[11px] text-gray-400 mt-1">{formatTime(n.createdAt)}</p>
                                    </div>
                                    {!n.isRead && (
                                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
