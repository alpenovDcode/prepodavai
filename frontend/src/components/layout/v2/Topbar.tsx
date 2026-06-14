'use client'

import { ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { SearchBar } from '@/components/ui/v2'
import { NotificationBellV2 } from '@/components/v2/NotificationBellV2'
import { cn } from '@/lib/utils/cn'

export interface TopbarProps {
    /** Заголовок страницы (h1). */
    title: ReactNode
    /** Подзаголовок под title. */
    subtitle?: ReactNode
    /** Действия справа (кнопки). */
    actions?: ReactNode
    /** @deprecated — в продукте всё бесплатно, баланс больше не показывается. */
    tokenBalance?: number
    /** @deprecated — счётчик теперь приходит из /notifications через NotificationBellV2. */
    notificationsCount?: number
    /** Аудитория для notification bell. По умолчанию 'teacher'. */
    notificationsAudience?: 'teacher' | 'student'
    /** Полностью скрыть bell (например в ультра-минималистичных экранах). */
    hideNotifications?: boolean
    /** Кнопка burger для мобильных. */
    onMobileMenuToggle?: () => void
    /** Колбэк для глобального поиска (Cmd+K). */
    onSearch?: () => void
    /** Скрыть поиск. */
    hideSearch?: boolean
}

/**
 * Topbar — верхняя панель внутри content area.
 * Sticky, с blur-backdrop, поиском, NotificationBell с live-счётчиком.
 */
export function Topbar({
    title,
    subtitle,
    actions,
    notificationsAudience = 'teacher',
    hideNotifications,
    onMobileMenuToggle,
    onSearch,
    hideSearch,
}: TopbarProps) {
    return (
        <header className={cn(
            'h-16 bg-white/90 backdrop-blur-md saturate-150 border-b border-ink-200',
            'flex items-center justify-between gap-4 px-8 sticky top-0 z-20',
            'max-md:px-4',
        )}>
            <div className="flex items-center gap-3 min-w-0 flex-1">
                {onMobileMenuToggle && (
                    <button
                        type="button"
                        onClick={onMobileMenuToggle}
                        aria-label="Открыть меню"
                        className="lg:hidden w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                )}
                <div className="min-w-0">
                    <h1 className="font-display text-[20px] font-bold text-ink-900 tracking-tight truncate">
                        {title}
                    </h1>
                    {subtitle && (
                        <div className="text-[13px] text-ink-500 mt-0.5 truncate">{subtitle}</div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
                {!hideSearch && (
                    <SearchBar
                        placeholder="Поиск материалов, учеников…"
                        kbdHint="⌘K"
                        readOnly
                        onClick={onSearch}
                        className="hidden lg:block w-[280px]"
                    />
                )}

                {actions}

                {!hideNotifications && <NotificationBellV2 audience={notificationsAudience} />}
            </div>
        </header>
    )
}
