'use client'

import { ReactNode, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import {
    LayoutDashboard, Wand2, Calendar, BookOpen,
    Users, ClipboardCheck, BarChart3,
    Gift, MessageCircle, Settings, ChevronUp, LogOut,
    ChevronLeft, ChevronRight, Newspaper, Send,
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
    /** Свёрнут ли сайдбар (desktop). */
    collapsed?: boolean
    /** Переключить свёрнутое состояние. */
    onToggleCollapsed?: () => void
}

/**
 * Sidebar дизайн-системы redesign-v2.
 * Группированная навигация + профиль внизу.
 */
export function Sidebar({ sections, user, brandName = 'Преподавай', open = true, onClose, collapsed = false, onToggleCollapsed }: SidebarProps) {
    const [hovered, setHovered] = useState(false)
    // Визуально развёрнут, если не свёрнут ИЛИ если свёрнут, но наведена мышь
    const visuallyExpanded = !collapsed || hovered
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
                onMouseEnter={() => collapsed && setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className={cn(
                    'bg-surface border-r border-ink-200 flex flex-col flex-shrink-0',
                    'transition-[width] duration-200 ease-out',
                    // Ширина: свёрнут — 68px, иначе/при ховере — 260px
                    visuallyExpanded ? 'w-[260px]' : 'w-[68px]',
                    // Desktop: статичный sticky-сайдбар, занимает место в layout-flow
                    'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
                    // При hover-разворачивании поверх контента (не двигаем main)
                    // Mobile: оверлей справа от content, не занимает место
                    'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:h-screen max-lg:w-[260px]',
                    'max-lg:transition-transform',
                    open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full',
                )}
            >
                {/* Brand */}
                <div className={cn(
                    'flex items-center gap-2.5 pt-5 pb-6 border-b border-ink-100',
                    visuallyExpanded ? 'px-5' : 'px-4 justify-center',
                )}>
                    <Image
                        src="/logo-prepodavai.png"
                        alt=""
                        width={32}
                        height={32}
                        className="rounded-lg object-cover flex-shrink-0"
                        priority
                    />
                    {visuallyExpanded && (
                        <span className="font-display font-bold text-[16px] text-ink-900 tracking-tight whitespace-nowrap overflow-hidden">
                            {brandName}
                        </span>
                    )}
                </div>

                {/* Navigation */}
                <nav className={cn('flex-1 overflow-y-auto py-4', visuallyExpanded ? 'px-3' : 'px-2')}>
                    {sections.map((section, idx) => (
                        <div key={idx}>
                            {section.label && visuallyExpanded && (
                                <div className={cn(
                                    'px-3 mt-4 mb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-400',
                                    idx === 0 && 'mt-0',
                                )}>
                                    {section.label}
                                </div>
                            )}
                            {section.label && !visuallyExpanded && idx > 0 && (
                                <div className="my-2 mx-2 h-px bg-ink-100" />
                            )}
                            <ul className="space-y-0.5">
                                {section.items.map((item, i) => (
                                    <li key={i}>
                                        <SidebarNavItem item={item} collapsed={!visuallyExpanded} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>

                {/* Collapse toggle (desktop only) */}
                {onToggleCollapsed && (
                    <button
                        type="button"
                        onClick={onToggleCollapsed}
                        className={cn(
                            'hidden lg:flex items-center gap-2 mx-3 mb-2 px-3 py-2 rounded-md text-[12px] font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-700 transition-colors',
                            visuallyExpanded ? 'justify-start' : 'justify-center',
                        )}
                        aria-label={collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар'}
                        title={collapsed ? 'Развернуть' : 'Свернуть'}
                    >
                        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                        {visuallyExpanded && <span>Свернуть</span>}
                    </button>
                )}

                {/* User footer */}
                <UserFooter user={user} collapsed={!visuallyExpanded} />
            </aside>
        </>
    )
}

function UserFooter({ user, collapsed = false }: { user: SidebarUserInfo; collapsed?: boolean }) {
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
                className={cn(
                    'w-full flex items-center rounded-md bg-surface border border-ink-200 hover:bg-ink-50 transition-colors text-left',
                    collapsed ? 'justify-center p-1.5' : 'gap-3 p-2.5',
                )}
                aria-label="Меню пользователя"
                title={collapsed ? user.name : undefined}
            >
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {user.initials || user.name.slice(0, 2).toUpperCase()}
                </span>
                {!collapsed && (
                    <>
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
                    </>
                )}
            </button>
        </div>
    )
}

function SidebarNavItem({ item, collapsed = false }: { item: NavItem; collapsed?: boolean }) {
    const pathname = usePathname()
    const isDisabled = item.disabled || item.comingSoon
    const isActive = !isDisabled && (item.forceActive || (item.href ? pathname === item.href || pathname?.startsWith(item.href + '/') : false))

    const content = (
        <span
            data-tour={item.tourId}
            title={collapsed ? item.label : undefined}
            className={cn(
            'flex items-center rounded-md font-medium text-sm',
            'transition-colors duration-fast ease-out-expo',
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
            isDisabled
                ? 'text-ink-300 cursor-not-allowed opacity-60'
                : isActive
                    ? 'bg-brand-50 text-brand-700 cursor-pointer'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 cursor-pointer',
        )}>
            <span className={cn(
                'flex-shrink-0 relative',
                isActive ? 'text-brand-600' : 'text-current',
            )}>
                {item.icon}
                {collapsed && !item.comingSoon && item.badge != null && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-brand-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {item.badge}
                    </span>
                )}
            </span>
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
            {!collapsed && item.comingSoon && (
                <span className="ml-auto bg-ink-100 text-ink-400 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                    Скоро
                </span>
            )}
            {!collapsed && !item.comingSoon && item.badge != null && (
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
                { label: 'Календарь',     href: '/dashboard/calendar',     icon: i(Calendar),        tourId: 'nav-calendar' },
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
                { label: 'Блог',          href: '/blog',                   icon: i(Newspaper),       tourId: 'nav-blog' },
                { label: 'Сообщество',    href: 'https://t.me/prepodavaII', icon: i(Send),           tourId: 'nav-community', external: true },
                { label: 'Пригласить',    href: '/dashboard/referrals',    icon: i(Gift),            tourId: 'nav-invite' },
                { label: 'Поддержка',     href: 'https://t.me/prepodavai_help_bot', icon: i(MessageCircle), tourId: 'nav-support', external: true },
                { label: 'Настройки',     href: '/dashboard/settings',     icon: i(Settings),        tourId: 'nav-settings' },
            ],
        },
    ]
}
