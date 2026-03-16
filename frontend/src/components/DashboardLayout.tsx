'use client'

import { useState, ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LOGO_BASE64 } from '@/constants/branding'

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

    const isActive = (path: string) => pathname === path

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
                className={`sidebar ${sidebarOpen ? 'mobile-open' : 'sidebar-hidden'} md:translate-x-0 z-50`}
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
                <nav className="py-4">
                    {navItems.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => {
                                router.push(item.path)
                                setSidebarOpen(false)
                            }}
                            className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
                        >
                            <i className={`${item.icon} w-5 text-center`}></i>
                            <span>{item.label}</span>
                        </div>
                    ))}
                </nav>

                {/* Upgrade Card */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-4 border border-primary-200">
                        <h3 className="font-bold text-primary-900 mb-1">PRO Подписка</h3>
                        <p className="text-xs text-primary-700 mb-3">
                            Откройте все функции и создавайте без ограничений.
                        </p>
                        <button className="w-full py-2 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition">
                            Улучшить
                        </button>
                    </div>

                    {/* User Profile */}
                    <div className="mt-4 flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 cursor-pointer transition">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-semibold">
                            JD
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">Jane Doe</p>
                            <p className="text-xs text-gray-500 truncate">jane.doe@email.com</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="md:ml-[240px] min-h-screen">
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
