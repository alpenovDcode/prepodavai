'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import {
    LayoutDashboard,
    Users,
    CreditCard,
    Settings,
    LogOut,
    Menu,
    X,
    Shield,
    BarChart2,
    BookOpen,
    Megaphone,
    ScrollText,
    Link2,
    FlaskConical,
    Bell,
    CrownIcon,
    Filter,
    Sparkles,
} from 'lucide-react'

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true)
    // null = ещё проверяем (не рендерим сайдбар!), true/false = решено
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
    const pathname = usePathname()
    const router = useRouter()

    useEffect(() => {
        // Страница логина — пропускаем проверку.
        if (pathname === '/check/prrv/admin/login') return

        // Раньше layout проверял только `prepodavai_authenticated` — но этот
        // флаг ставится И для обычных пользователей при логине через лендинг.
        // В итоге авторизованный юзер мог открыть /admin и увидеть сайдбар
        // (только API-данные не грузились, потому что бэк отдавал 401).
        //
        // Чиним по двум уровням:
        //  1. На клиенте — проверяем `prepodavai_user.role === 'admin'`. Этот
        //     ключ кладёт ТОЛЬКО /check/prrv/admin/login.
        //  2. На сервере — пингуем /admin/stats. Если кук admin-сессии нет
        //     или бэк отвечает 401 — выкидываем на логин.
        let cancelled = false
        ;(async () => {
            let clientRoleOk = false
            try {
                const raw = localStorage.getItem('prepodavai_user')
                const u = raw ? JSON.parse(raw) : null
                clientRoleOk = u?.role === 'admin'
            } catch { /* битый json — считаем не админом */ }

            if (!clientRoleOk) {
                if (!cancelled) setIsAdmin(false)
                router.push('/check/prrv/admin/login')
                return
            }

            // Проверяем на бэке. apiClient использует withCredentials и кладёт
            // токен из httpOnly cookie. Любой 4xx/5xx → не пускаем.
            try {
                const r = await apiClient.get('/admin/stats')
                if (cancelled) return
                if (r.data?.success) {
                    setIsAdmin(true)
                } else {
                    setIsAdmin(false)
                    router.push('/check/prrv/admin/login')
                }
            } catch {
                if (cancelled) return
                setIsAdmin(false)
                localStorage.removeItem('prepodavai_authenticated')
                localStorage.removeItem('prepodavai_user')
                router.push('/check/prrv/admin/login')
            }
        })()
        return () => { cancelled = true }
    }, [pathname, router])

    const handleLogout = () => {
        localStorage.removeItem('prepodavai_authenticated')
        localStorage.removeItem('prepodavai_user')
        setIsAdmin(false)
        router.push('/check/prrv/admin/login')
    }

    // На странице логина рендерим только children без сайдбара.
    if (pathname === '/check/prrv/admin/login') {
        return <>{children}</>
    }

    // Пока решение не принято — НЕ рисуем сайдбар. Это лечит «утечку UI»
    // когда обычный авторизованный юзер открывал /admin вручную.
    if (isAdmin !== true) return null

    const navigation = [
        { name: 'Дашборд', href: '/check/prrv/admin/dashboard', icon: LayoutDashboard },
        { name: 'Аналитика', href: '/check/prrv/admin/analytics', icon: BarChart2 },
        { name: 'Пользователи', href: '/check/prrv/admin/users', icon: Users },
        { name: 'Классы', href: '/check/prrv/admin/classes', icon: BookOpen },
        { name: 'Финансы', href: '/check/prrv/admin/finances', icon: CreditCard },
        { name: 'Маркетинг', href: '/check/prrv/admin/marketing', icon: Megaphone },
        { name: 'Popup-окна', href: '/check/prrv/admin/popups', icon: Megaphone },
        { name: 'Тех. работы', href: '/check/prrv/admin/maintenance', icon: Bell },
        { name: 'UTM-ссылки', href: '/check/prrv/admin/utm', icon: Link2 },
        { name: 'Умные ссылки', href: '/check/prrv/admin/smart-links', icon: Sparkles },
        { name: 'Тарифы', href: '/check/prrv/admin/tariffs', icon: CrownIcon },
        { name: 'Продукт', href: '/check/prrv/admin/product-analytics', icon: FlaskConical },
        { name: 'Воронки', href: '/check/prrv/admin/funnels', icon: Filter },
        { name: 'Алерты', href: '/check/prrv/admin/alerts', icon: Bell },
        { name: 'Логи', href: '/check/prrv/admin/system-logs', icon: ScrollText },
        { name: 'Администраторы', href: '/check/prrv/admin/admins', icon: Shield },
        { name: 'Настройки AI', href: '/check/prrv/admin/settings', icon: Settings },
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
                        <h2 className="text-xl font-bold tracking-tight">Преподавай</h2>
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
