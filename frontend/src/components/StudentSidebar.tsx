'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, GraduationCap, MessageSquare, Settings, HelpCircle, LogOut } from 'lucide-react'
import NotificationBell from './NotificationBell'

interface StudentUser {
    id: string
    name: string
    role: string
    className?: string | null
}

interface StudentSidebarProps {
    user: StudentUser | null
    onLogout: () => void
}

export default function StudentSidebar({ user, onLogout }: StudentSidebarProps) {
    const pathname = usePathname()

    const navItems = [
        { name: 'Главная', href: '/student/dashboard', icon: LayoutDashboard },
        { name: 'Задания', href: '/student/dashboard', icon: BookOpen },
        { name: 'Оценки', href: '/student/grades', icon: GraduationCap },
        { name: 'Сообщения', href: '/student/messages', icon: MessageSquare },
    ]

    const bottomItems = [
        { name: 'Настройки', href: '#', icon: Settings },
        { name: 'Помощь', href: '#', icon: HelpCircle },
    ]

    const initials = user?.name
        ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'У'

    return (
        <aside className="w-64 bg-white border-r border-gray-100 h-screen sticky top-0 flex flex-col hidden lg:flex">
            {/* User Profile */}
            <div className="p-6 pb-4">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-lg flex-shrink-0">
                        {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-gray-900 text-sm truncate">{user?.name || 'Ученик'}</h3>
                        <p className="text-xs text-gray-500">{user?.className || 'Загрузка...'}</p>
                    </div>
                    {user?.id && (
                        <NotificationBell userType="student" studentId={user.id} />
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/student/dashboard' && pathname.startsWith(item.href))
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isActive
                                    ? 'bg-orange-50 text-orange-600'
                                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                        >
                            <item.icon size={20} />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="p-4 space-y-1 border-t border-gray-100">
                {bottomItems.map((item) => (
                    <Link
                        key={item.name}
                        href={item.href}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                        <item.icon size={20} />
                        {item.name}
                    </Link>
                ))}
                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                    <LogOut size={20} />
                    Выйти
                </button>
            </div>
        </aside>
    )
}
