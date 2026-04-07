'use client'

import { useState, useEffect, useCallback } from 'react'

interface IsMobileResult {
    isMobile: boolean
    isMiniApp: boolean
    isReady: boolean
}

function checkMiniApp(): boolean {
    return !!(
        (window as any).Telegram?.WebApp?.initData ||
        (window as any).WebApp?.initData ||
        new URLSearchParams(window.location.search).has('tgWebAppData') ||
        new URLSearchParams(window.location.search).has('max_init_data')
    )
}

export function useIsMobile(): IsMobileResult {
    const [state, setState] = useState<IsMobileResult>({
        isMobile: false,
        isMiniApp: false,
        isReady: false,
    })

    const update = useCallback(() => {
        setState({
            isMobile: window.innerWidth < 768,
            isMiniApp: checkMiniApp(),
            isReady: true,
        })
    }, [])

    useEffect(() => {
        update()

        let timer: ReturnType<typeof setTimeout>
        const handleResize = () => {
            clearTimeout(timer)
            timer = setTimeout(update, 150)
        }

        window.addEventListener('resize', handleResize)
        return () => {
            window.removeEventListener('resize', handleResize)
            clearTimeout(timer)
        }
    }, [update])

    return state
}
