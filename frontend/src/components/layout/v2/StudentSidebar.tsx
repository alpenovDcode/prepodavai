'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
    LayoutDashboard, BookOpen, GraduationCap, Bot, Trophy, Bell, Flame, Star,
} from 'lucide-react'
import { NavItem, NavSection } from './Sidebar'
import { cn } from '@/lib/utils/cn'

export interface StudentInfo {
    name: string
    className?: string
    initials?: string
    /** Стрик в днях. */
    streakDays?: number
    /** Накопленный XP. */
    xp?: number
}

export interface StudentSidebarProps {
    sections: NavSection[]
    student: StudentInfo
    open?: boolean
    onClose?: () => void
}

/**
 * Sidebar для интерфейса ученика. Более тёплый, с геймификацией внизу (стрик + опыт).
 */
export function StudentSidebar({ sections, student, open = true, onClose }: StudentSidebarProps) {
    return (
        <>
            {open && onClose && (
                <div
                    className="lg:hidden fixed inset-0 z-30 bg-black/40 animate-fade-in"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}
            <aside
                className={cn(
                    'bg-surface border-r border-ink-200 flex flex-col w-[240px] flex-shrink-0',
                    'transition-transform duration-base ease-out-expo',
                    'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
                    'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:h-screen',
                    open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
                )}
            >
                {/* Brand */}
                <div className="flex items-center gap-2.5 px-5 pt-5 pb-6 border-b border-ink-100">
                    <Image
                        src="/logo-prepodavai.png"
                        alt=""
                        width={32}
                        height={32}
                        className="rounded-lg object-cover"
                        priority
                    />
                    <span className="font-display font-bold text-[16px] text-ink-900 tracking-tight">
                        Преподавай
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-4">
                    {sections.map((section, idx) => (
                        <ul key={idx} className="space-y-0.5">
                            {section.items.map((item, i) => (
                                <li key={i}>
                                    <StudentNavItemLink item={item} />
                                </li>
                            ))}
                        </ul>
                    ))}
                </nav>

                {/* Gamified profile */}
                <div className="m-3 p-3.5 rounded-lg border border-brand-200 bg-gradient-to-br from-brand-50 to-white">
                    <div className="flex items-center gap-2.5 mb-3">
                        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {student.initials || student.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                            <div className="font-bold text-[13px] text-ink-900 leading-tight truncate">
                                {student.name}
                            </div>
                            {student.className && (
                                <div className="text-[11px] text-ink-500 leading-tight mt-0.5 truncate">
                                    {student.className}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white rounded text-center py-2 px-2.5">
                            <div className="font-display font-extrabold text-[16px] text-ink-900 tnum inline-flex items-center gap-1 leading-none">
                                <Flame className="w-3.5 h-3.5 text-amber-500" />
                                {student.streakDays ?? 0}
                            </div>
                            <div className="text-[10px] uppercase font-semibold tracking-wide text-ink-500 mt-1">
                                стрик
                            </div>
                        </div>
                        <div className="bg-white rounded text-center py-2 px-2.5">
                            <div className="font-display font-extrabold text-[16px] text-ink-900 tnum inline-flex items-center gap-1 leading-none">
                                <Star className="w-3.5 h-3.5 text-amber-500" />
                                {student.xp ?? 0}
                            </div>
                            <div className="text-[10px] uppercase font-semibold tracking-wide text-ink-500 mt-1">
                                опыт
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    )
}

function StudentNavItemLink({ item }: { item: NavItem }) {
    const pathname = usePathname()
    const isActive = item.forceActive || (item.href ? pathname === item.href || pathname?.startsWith(item.href + '/') : false)

    const content = (
        <span className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-md font-medium text-sm cursor-pointer',
            'transition-colors duration-fast ease-out-expo',
            isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        )}>
            <span className={cn('flex-shrink-0', isActive ? 'text-brand-600' : '')}>
                {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge != null && (
                <span className="ml-auto bg-brand-500 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                </span>
            )}
        </span>
    )

    return item.href ? <Link href={item.href}>{content}</Link> : content
}

/**
 * Дефолтные секции навигации для ученика.
 */
export function getStudentNavSections(badges: { assignments?: number; notifications?: number } = {}): NavSection[] {
    const i = (Icon: typeof LayoutDashboard) => <Icon className="w-[18px] h-[18px]" />
    return [{
        items: [
            { label: 'Главная',       href: '/student/dashboard',     icon: i(LayoutDashboard) },
            { label: 'Задания',       href: '/student/assignments',   icon: i(BookOpen),       badge: badges.assignments },
            { label: 'Оценки',        href: '/student/grades',        icon: i(GraduationCap) },
            { label: 'ИИ-учитель',    href: '/student/ai-teacher',    icon: i(Bot) },
            { label: 'Достижения',    href: '/student/achievements',  icon: i(Trophy) },
            { label: 'Уведомления',   href: '/student/notifications', icon: i(Bell),           badge: badges.notifications },
        ],
    }]
}
