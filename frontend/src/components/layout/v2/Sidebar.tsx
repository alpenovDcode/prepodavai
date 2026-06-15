'use client'

import { ReactNode, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
    LayoutDashboard, Wand2, Calendar, BookOpen,
    Users, ClipboardCheck, BarChart3,
    Gift, MessageCircle, Settings, ChevronUp, LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SidebarUserInfo {
    name: string
    plan?: string
    initials?: string
}

export interface NavItem {
    label: string
    href?: string
    icon: ReactNode
    badge?: number | string
    /** Если true — пункт всегда отображается активным (для кастомных кейсов). */
    forceActive?: boolean
    /** data-tour атрибут для тура */
    tourId?: string
    /** Ссылка открывается в новой вкладке */
    external?: boolean
    /** Заблокировано — некликабельно, серое */
    disabled?: boolean
    /** Показывает бейдж «Скоро» и блокирует клик */
    comingSoon?: boolean
}

export interface NavSection {
    label?: string
    items: NavItem[]
}

export interface SidebarProps {
    sections: NavSection[]
    user: SidebarUserInfo
    brandName?: string
    /** Открыт ли (на мобильном). */
    open?: boolean
    /** Закрыть (на мобильном). */
    onClose?: () => void
}

/**
 * Sidebar дизайн-системы redesign-v2.
 * Группированная навигация + профиль внизу.
 */
export function Sidebar({ sections, user, brandName = 'Преподавай', open = true, onClose }: SidebarProps) {
    return (
        <>
            {/* Mobile overlay */}
            {open && onClose && (
                <div
                    className="lg:hidden fixed inset-0 z-30 bg-black/40 animate-fade-in"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside
                data-tour="sidebar"
                className={cn(
                    'bg-surface border-r border-ink-200 flex flex-col w-[260px] flex-shrink-0',
                    'transition-transform duration-base ease-out-expo',
                    // Desktop: статичный sticky-сайдбар, занимает место в layout-flow
                    'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
                    // Mobile: оверлей справа от content, не занимает место
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
                        {brandName}
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto px-3 py-4">
                    {sections.map((section, idx) => (
                        <div key={idx}>
                            {section.label && (
                                <div className={cn(
                                    'px-3 mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400',
                                    idx === 0 && 'mt-0',
                                )}>
                                    {section.label}
                                </div>
                            )}
                            <ul className="space-y-0.5">
                                {section.items.map((item, i) => (
                                    <li key={i}>
                                        <SidebarNavItem item={item} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* User footer */}
                <UserFooter user={user} />
            </aside>
        </>
    )
}

function UserFooter({ user }: { user: SidebarUserInfo }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_authenticated')
        localStorage.removeItem('prepodavai_user')
        window.location.href = '/'
    }

    return (
        <div className="p-4 border-t border-ink-100 bg-surface-soft relative" ref={ref}>
            {open && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-surface border border-ink-200 rounded-lg shadow-lg overflow-hidden z-10">
                    <Link
                        href="/dashboard/settings"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-ink-700 hover:bg-ink-50 transition-colors"
                    >
                        <Settings className="w-4 h-4 text-ink-400" />
                        Настройки
                    </Link>
                    <div className="h-px bg-ink-100" />
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-danger-700 hover:bg-danger-50 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Выйти
                    </button>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-3 p-2.5 rounded-md bg-surface border border-ink-200 hover:bg-ink-50 transition-colors text-left"
                aria-label="Меню пользователя"
            >
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {user.initials || user.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[13px] text-ink-900 leading-tight truncate">
                        {user.name}
                    </span>
                    {user.plan && (
                        <span className="block text-[11px] text-ink-500 leading-tight mt-0.5 truncate">
                            {user.plan}
                        </span>
                    )}
                </span>
                <ChevronUp className={cn('w-4 h-4 text-ink-400 flex-shrink-0 transition-transform duration-150', !open && 'rotate-180')} />
            </button>
        </div>
    )
}

function SidebarNavItem({ item }: { item: NavItem }) {
    const pathname = usePathname()
    const isDisabled = item.disabled || item.comingSoon
    const isActive = !isDisabled && (item.forceActive || (item.href ? pathname === item.href || pathname?.startsWith(item.href + '/') : false))

    const content = (
        <span
            data-tour={item.tourId}
            className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-md font-medium text-sm',
            'transition-colors duration-fast ease-out-expo',
            isDisabled
                ? 'text-ink-300 cursor-not-allowed opacity-60'
                : isActive
                    ? 'bg-brand-50 text-brand-700 cursor-pointer'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 cursor-pointer',
        )}>
            <span className={cn(
                'flex-shrink-0',
                isActive ? 'text-brand-600' : 'text-current',
            )}>
                {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.comingSoon && (
                <span className="ml-auto bg-ink-100 text-ink-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                    Скоро
                </span>
            )}
            {!item.comingSoon && item.badge != null && (
                <span className="ml-auto bg-brand-500 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded-full">
                    {item.badge}
                </span>
            )}
        </span>
    )

    if (isDisabled) return content
    if (item.external && item.href) {
        return <a href={item.href} target="_blank" rel="noopener noreferrer">{content}</a>
    }
    return item.href ? <Link href={item.href}>{content}</Link> : content
}

/**
 * Дефолтные секции навигации для учителя.
 * Иконки lucide-react.
 */
export function getTeacherNavSections(badges: { studentsAtRisk?: number; pendingGrading?: number } = {}): NavSection[] {
    const i = (Icon: typeof LayoutDashboard) => <Icon className="w-[18px] h-[18px]" />
    return [
        {
            label: 'Рабочий стол',
            items: [
                { label: 'Главная',       href: '/dashboard',              icon: i(LayoutDashboard), tourId: 'nav-home' },
                { label: 'ИИ Генератор',  href: '/workspace',              icon: i(Wand2),           tourId: 'nav-ai' },
                { label: 'Календарь',     href: '/dashboard/calendar',     icon: i(Calendar),        tourId: 'nav-calendar', comingSoon: true },
                { label: 'Материалы',     href: '/dashboard/courses',      icon: i(BookOpen),        tourId: 'nav-materials' },
            ],
        },
        {
            label: 'Класс',
            items: [
                { label: 'Ученики',       href: '/dashboard/students',     icon: i(Users),           badge: badges.studentsAtRisk, tourId: 'nav-students' },
                { label: 'Проверка ДЗ',   href: '/dashboard/grading',      icon: i(ClipboardCheck),  badge: badges.pendingGrading, tourId: 'nav-grading' },
                { label: 'Аналитика',     href: '/dashboard/analytics',    icon: i(BarChart3),       tourId: 'nav-analytics' },
            ],
        },
        {
            label: 'Прочее',
            items: [
                { label: 'Пригласить',    href: '/dashboard/referrals',    icon: i(Gift),            tourId: 'nav-invite' },
                { label: 'Поддержка',     href: 'https://t.me/prepodavai_help_bot', icon: i(MessageCircle), tourId: 'nav-support', external: true },
                { label: 'Настройки',     href: '/dashboard/settings',     icon: i(Settings),        tourId: 'nav-settings' },
            ],
        },
    ]
}
