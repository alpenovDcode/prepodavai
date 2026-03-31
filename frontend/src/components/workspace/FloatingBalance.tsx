'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { usePathname } from 'next/navigation'

export default function FloatingBalance() {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const pathname = usePathname()

    useEffect(() => {
        const checkAuth = () => {
            setIsAuthenticated(!!localStorage.getItem('prepodavai_authenticated'))
        }
        checkAuth()
        window.addEventListener('storage', checkAuth)
        return () => window.removeEventListener('storage', checkAuth)
    }, [pathname])

    const [isMobileOrMiniApp, setIsMobileOrMiniApp] = useState(false)

    useEffect(() => {
        const check = () => {
            const mobile = window.innerWidth < 768
            const mini = !!(
                (window as any).Telegram?.WebApp?.initData ||
                (window as any).WebApp?.initData ||
                new URLSearchParams(window.location.search).has('tgWebAppData') ||
                new URLSearchParams(window.location.search).has('max_init_data')
            )
            setIsMobileOrMiniApp(mobile || mini)
        }
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const { totalCredits, loading, error } = useSubscription({ enabled: isAuthenticated && !pathname.startsWith('/admin') })

    if (!isAuthenticated || error || pathname.startsWith('/admin') || isMobileOrMiniApp) return null

    const getLabel = (value: number) => {
        if (value === 0) return 'токенов'
        const lastDigit = value % 10
        const lastTwoDigits = value % 100

        if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'токенов'
        if (lastDigit === 1) return 'токен'
        if (lastDigit >= 2 && lastDigit <= 4) return 'токена'
        return 'токенов'
    }

    return (
        <div 
            className="fixed bottom-6 right-6 z-[9999] animate-fade-in-up"
        >
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white/90 backdrop-blur-md border border-purple-100 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_40px_rgba(147,51,234,0.15)] transition-all duration-300 group ring-1 ring-purple-50/50">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(147,51,234,0.3)] group-hover:scale-110 transition-transform duration-300">
                    <Sparkles className="w-4 h-4 fill-white" />
                </div>
                
                <div className="flex flex-col pr-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 leading-tight">Баланс</span>
                    <div className="flex items-center gap-1.5 min-w-[70px]">
                        {loading ? (
                            <div className="flex items-center">
                                <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                            </div>
                        ) : (
                            <span className="text-sm font-black text-gray-900 leading-none">
                                {totalCredits} <span className="font-medium text-gray-500">{getLabel(totalCredits)}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>
            
            <style jsx>{`
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }
                .animate-fade-in-up {
                    animation: fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
            `}</style>
        </div>
    )
}
