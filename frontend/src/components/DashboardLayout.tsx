'use client'

import { useState, ReactNode, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@/lib/hooks/useUser'
import { useMiniAppAuth } from '@/lib/hooks/useMiniAppAuth'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { LOGO_BASE64 } from '@/constants/branding'
import { apiClient } from '@/lib/api/client'
import { Loader2, Menu, X, ArrowLeft, LayoutDashboard, Wand2, BookOpen, Users, BarChart, Settings as SettingsIcon, Sparkles } from 'lucide-react'

interface DashboardLayoutProps {
    children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const pathname = usePathname()
    const router = useRouter()
    const { ready: authReady, failed: authFailed } = useMiniAppAuth()

    const navItems = [
        { id: 'dashboard', label: 'Главная', icon: LayoutDashboard, path: '/dashboard' },
        { id: 'ai', label: 'ИИ Генератор', icon: Wand2, path: '/workspace' },
        { id: 'courses', label: 'Материалы', icon: BookOpen, path: '/dashboard/courses' },
        { id: 'students', label: 'Ученики', icon: Users, path: '/dashboard/students' },
        { id: 'analytics', label: 'Аналитика', icon: BarChart, path: '/dashboard/analytics' },
        { id: 'settings', label: 'Настройки', icon: SettingsIcon, path: '/dashboard/settings' },
    ]

    const { fullName, user, initials } = useUser()
    const { totalCredits, loading: balanceLoading } = useSubscription({ enabled: true })

    const isActive = (path: string) => {
        if (path === '/dashboard' && pathname !== '/dashboard') return false
        return pathname.startsWith(path)
    }

    // Проверка, является ли устройство мобильным (включая Mini App)
    const [isMobile, setIsMobile] = useState(false)
    const [isMiniApp, setIsMiniApp] = useState(false)

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768
            const mini = !!(
                (window as any).Telegram?.WebApp?.initData ||
                (window as any).WebApp?.initData ||
                new URLSearchParams(window.location.search).has('tgWebAppData') ||
                new URLSearchParams(window.location.search).has('max_init_data')
            )
            setIsMobile(mobile)
            setIsMiniApp(mini)
        }
        
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // Ожидаем авто-логин из Mini App
    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
            </div>
        )
    }

    // Авто-логин не удался и нет сессии — редирект на главную
    if (authFailed && typeof window !== 'undefined' && localStorage.getItem('prepodavai_authenticated') !== 'true') {
        window.location.href = '/'
        return null
    }

    // Bottom tab items for Mobile/Mini App
    const mobileNavItems = [
        { id: 'dashboard', label: 'Главная', icon: 'fa-solid fa-house', path: '/dashboard' },
        { id: 'ai', label: 'ИИ', icon: 'fas fa-wand-magic-sparkles', path: '/workspace' },
        { id: 'courses', label: 'Материалы', icon: 'fas fa-book', path: '/dashboard/courses' },
        { id: 'students', label: 'Ученики', icon: 'fas fa-users', path: '/dashboard/students' },
        { id: 'settings', label: 'Ещё', icon: 'fas fa-ellipsis', path: '/dashboard/settings' },
    ]

    if (isMobile || isMiniApp) {
        return (
            <div className="min-h-screen bg-[#F9FAFB] pb-16">
                {/* Mobile header */}
                <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center hover:bg-gray-100 transition active:scale-95"
                    >
                        <Menu className="w-5 h-5 text-gray-700" />
                    </button>
                    <div className="flex items-center gap-2">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="PrepodavAI" className="w-7 h-7 object-contain" />
                        ) : (
                            <LayoutDashboard className="w-5 h-5 text-primary-600" />
                        )}
                        <span className="font-bold text-gray-900 text-sm">Панель управления</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 border border-purple-100 rounded-full">
                        <Sparkles className="w-3 h-3 text-purple-600 fill-purple-600 flex-shrink-0" />
                        {balanceLoading ? (
                            <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />
                        ) : (
                            <span className="text-xs font-black text-purple-700 leading-none">{totalCredits}</span>
                        )}
                    </div>
                </div>

                {/* Sidebar drawer for mobile */}
                {sidebarOpen && (
                    <div className="fixed inset-0 z-[60]">
                        <div 
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" 
                            onClick={() => setSidebarOpen(false)} 
                        />
                        <div className="absolute left-0 top-0 bottom-0 w-[280px] bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-300 ease-out">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <span className="font-bold text-gray-900">Навигация</span>
                                <button
                                    onClick={() => setSidebarOpen(false)}
                                    className="w-8 h-8 rounded-lg bg-white border border-gray-100 shadow-sm flex items-center justify-center active:scale-95"
                                >
                                    <X className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                            
                            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                                {navItems.map((item) => {
                                    const Icon = item.icon
                                    const active = isActive(item.path)
                                    return (
                                        <Link
                                            key={item.id}
                                            href={item.path}
                                            onClick={() => setSidebarOpen(false)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                                                active ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100/50' : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            <Icon className={`w-5 h-5 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
                                            <span>{item.label}</span>
                                        </Link>
                                    )
                                })}
                            </nav>

                            <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                                <div className="flex items-center gap-3 p-2 rounded-xl bg-white border border-gray-100">
                                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                                        {initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate">{fullName}</p>
                                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <main className="p-4">
                    {children}
                </main>

                {/* Bottom Tab Bar */}
                <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 z-50 safe-area-bottom shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                    <div className="flex justify-around items-center h-16 px-2">
                        {mobileNavItems.map((item) => {
                            const active = pathname === item.path || (item.path !== '/dashboard' && pathname.startsWith(item.path))
                            return (
                                <Link
                                    key={item.id}
                                    href={item.path}
                                    className={`flex flex-col items-center justify-center flex-1 h-full transition-all relative ${
                                        active ? 'text-primary-600' : 'text-gray-400'
                                    }`}
                                >
                                    {active && (
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary-600 rounded-b-full shadow-[0_2px_4px_rgba(37,99,235,0.2)]" />
                                    )}
                                    <i className={`${item.icon} text-lg mb-1 ${active ? 'scale-110' : ''} transition-transform`}></i>
                                    <span className={`text-[10px] font-bold tracking-tight ${active ? 'opacity-100' : 'opacity-70'}`}>
                                        {item.label}
                                    </span>
                                </Link>
                            )
                        })}
                    </div>
                </nav>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#fcfcfc]">
            {/* Desktop Sidebar */}
            <aside
                className="fixed inset-y-0 left-0 w-[260px] bg-white border-r border-gray-200 z-50 flex flex-col shadow-[4px_0_12px_rgba(0,0,0,0.02)] hidden md:flex"
            >
                {/* Logo */}
                <div className="p-6 border-b border-gray-50">
                    <div className="flex items-center gap-3">
                        {LOGO_BASE64 ? (
                            <img src={LOGO_BASE64} alt="PrepodavAI" className="w-10 h-10 object-contain rounded-lg" />
                        ) : (
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-200">
                                <LayoutDashboard className="text-white w-6 h-6" />
                            </div>
                        )}
                        <span className="text-xl font-bold text-gray-900 tracking-tight">PrepodavAI</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="py-6 flex-1 overflow-y-auto px-4 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon
                        const active = isActive(item.path)
                        return (
                            <Link
                                key={item.id}
                                href={item.path}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all border border-transparent ${
                                    active 
                                        ? 'bg-primary-50 text-primary-700 border-primary-100/50 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                            >
                                <Icon className={`w-5 h-5 ${active ? 'text-primary-600' : 'text-gray-400'}`} />
                                <span>{item.label}</span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Bottom Section: Profile */}
                <div className="p-4 border-t border-gray-100 bg-gray-50/30">
                    <div 
                        className="flex items-center justify-between p-3 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-primary-100 transition-all cursor-pointer group"
                        onClick={() => router.push('/dashboard/settings')}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold overflow-hidden shadow-md">
                                {user?.avatar ? (
                                    <img 
                                        src={`${apiClient.defaults.baseURL}/files/${user.avatar}`} 
                                        alt="Avatar" 
                                        className="w-full h-full object-cover"
                                    />
                                ) : initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 truncate">{fullName}</p>
                                <p className="text-[10px] text-gray-500 font-medium truncate">{user?.email || (user?.username ? `@${user.username}` : '')}</p>
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
                <main className="p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
