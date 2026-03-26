'use client'

import { useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/useUser'
import { LOGO_BASE64 } from '@/constants/branding'
import { apiClient } from '@/lib/api/client'

interface DashboardLayoutProps {
    children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const pathname = usePathname()
    const router = useRouter()

    const navItems = [
        { id: 'dashboard', label: 'Главная', icon: 'fa-solid fa-house', path: '/dashboard' },
        { id: 'ai', label: 'ИИ Генератор', icon: 'fas fa-wand-magic-sparkles', path: '/workspace' },
        { id: 'courses', label: 'Материалы', icon: 'fas fa-book', path: '/dashboard/courses' },
        { id: 'students', label: 'Ученики', icon: 'fas fa-users', path: '/dashboard/students' },
        { id: 'analytics', label: 'Аналитика', icon: 'fas fa-chart-bar', path: '/dashboard/analytics' },
        { id: 'settings', label: 'Настройки', icon: 'fas fa-cog', path: '/dashboard/settings' },
    ]

    const { fullName, user, initials } = useUser()

    const isActive = (path: string) => pathname === path

    // Проверка, находимся ли мы в Mini App
    const isMiniApp = typeof window !== 'undefined' && (
      (window as any).Telegram?.WebApp?.initData || 
      (window as any).WebApp?.initData ||
      new URLSearchParams(window.location.search).has('tgWebAppData') ||
      new URLSearchParams(window.location.search).has('max_init_data')
    )

    if (isMiniApp) {
        return (
            <div className="min-h-screen bg-[#F9FAFB]">
                <main className="p-4">
                    {children}
                </main>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`sidebar ${sidebarOpen ? 'mobile-open' : 'sidebar-hidden'} md:translate-x-0 z-50 flex flex-col`}
            >
                {/* Logo */}
                <div className="p-6">
                    <div className="flex items-center gap-3">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="PrepodavAI" className="w-10 h-10 object-contain" />
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center">
                                <i className="fas fa-graduation-cap text-white text-xl"></i>
                            </div>
                        )}
                        <span className="text-xl font-bold text-gray-900">PrepodavAI</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="py-4 flex-1 overflow-y-auto">
                    {navItems.map((item) => (
                        <Link
                            key={item.id}
                            href={item.path}
                            onClick={() => setSidebarOpen(false)}
                            className={`nav-item ${isActive(item.path) ? 'active' : ''} block w-full text-left`}
                        >
                            <div className="flex items-center gap-3">
                                <i className={`${item.icon} w-5 text-center`}></i>
                                <span>{item.label}</span>
                            </div>
                        </Link>
                    ))}
                </nav>

                {/* Bottom Section: Profile */}
                <div className="p-4 border-t border-gray-100">
                    {/* User Profile */}
                    <div 
                        className="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition border border-transparent hover:border-gray-100 cursor-pointer"
                        onClick={() => router.push('/dashboard/settings')}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-semibold overflow-hidden">
                                {user?.avatar ? (
                                    <img 
                                        src={`${apiClient.defaults.baseURL}/files/${user.avatar}`} 
                                        alt="Avatar" 
                                        className="w-full h-full object-cover"
                                    />
                                ) : initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{fullName}</p>
                                <p className="text-xs text-gray-500 truncate">{user?.email || (user?.username ? `@${user.username}` : '')}</p>
                            </div>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                localStorage.removeItem('prepodavai_authenticated');
                                localStorage.removeItem('prepodavai_user');
                                window.location.href = '/';
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Выйти"
                        >
                            <i className="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="md:ml-[260px] min-h-screen">
                {/* Mobile Header */}
                <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
                    >
                        <i className="fas fa-bars text-gray-700"></i>
                    </button>
                    <div className="flex items-center gap-2">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="PrepodavAI" className="w-8 h-8 object-contain" />
                        ) : (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center">
                                <i className="fas fa-graduation-cap text-white text-sm"></i>
                            </div>
                        )}
                        <span className="font-bold text-gray-900">PrepodavAI</span>
                    </div>
                    <div className="w-10"></div>
                </div>

                {/* Page Content */}
                <main className="p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
