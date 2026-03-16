'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    CreditCard,
    Settings,
    LogOut,
    Menu,
    X,
    Shield
} from 'lucide-react'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const pathname = usePathname()
    const router = useRouter()

    useEffect(() => {
        // Проверяем авторизацию, пропуская проверку на странице логина
        if (pathname === '/admin/login') {
            return
        }

        const token = localStorage.getItem('prepodavai_token')
        if (token) {
            setIsAuthenticated(true)
        } else {
            router.push('/admin/login')
        }
    }, [pathname, router])

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_token')
        localStorage.removeItem('prepodavai_authenticated')
        setIsAuthenticated(false)
        router.push('/admin/login')
    }

    // Если мы на странице логина, рендерим только детей без сайдбара
    if (pathname === '/admin/login') {
        return <>{children}</>
    }

    if (!isAuthenticated) return null // Или лоадер

    const navigation = [
        { name: 'Дашборд', href: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'Пользователи', href: '/admin/users', icon: Users },
        { name: 'Финансы', href: '/admin/finances', icon: CreditCard },
        { name: 'Настройки AI', href: '/admin/settings', icon: Settings },
    ]

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile sidebar toggle */}
            <button
                className="lg:hidden fixed z-50 bottom-4 right-4 bg-gray-900 text-white p-3 rounded-full shadow-lg"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
                {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Sidebar */}
            <aside
                className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-gray-900 text-white transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                    } flex flex-col`}
            >
                <div className="flex items-center gap-3 p-6 border-b border-gray-800">
                    <Shield className="w-8 h-8 text-blue-400" />
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">PrepodavAI</h2>
                        <span className="text-xs text-blue-400 font-medium">Administration</span>
                    </div>
                </div>

                <nav className="flex-1 py-6 px-4 space-y-2">
                    {navigation.map((item) => {
                        const Icon = item.icon
                        const isActive = pathname.startsWith(item.href)
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                                <span className="font-medium">{item.name}</span>
                            </Link>
                        )
                    })}
                </nav>

                <div className="p-4 border-t border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-3 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all"
                    >
                        <LogOut className="w-5 h-5 text-red-500" />
                        <span className="font-medium text-red-500">Выйти</span>
                    </button>
                    <div className="mt-4 px-4 text-xs text-gray-600 text-center">
                        Admin Dashboard v2.0
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-x-hidden relative min-h-screen">
                <div className="max-w-7xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
