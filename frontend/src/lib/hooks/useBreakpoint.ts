'use client'

import { useState, useEffect, useCallback } from 'react'

// Брейкпоинты совпадают с Tailwind: sm=640, md=768, lg=1024.
// Мобильник: < 768, планшет: 768..1023, десктоп: >= 1024.
export interface BreakpointState {
    isMobile: boolean
    isTablet: boolean
    isDesktop: boolean
    // Готовность после первого замера — нужно, чтобы избежать SSR-мигания.
    isReady: boolean
    width: number
}

const initial: BreakpointState = {
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isReady: false,
    width: 0,
}

export function useBreakpoint(): BreakpointState {
    const [state, setState] = useState<BreakpointState>(initial)

    const update = useCallback(() => {
        const w = typeof window === 'undefined' ? 0 : window.innerWidth
        setState({
            isMobile: w > 0 && w < 768,
            isTablet: w >= 768 && w < 1024,
            isDesktop: w === 0 || w >= 1024,
            isReady: true,
            width: w,
        })
    }, [])

    useEffect(() => {
        update()
        let timer: ReturnType<typeof setTimeout>
        const onResize = () => {
            clearTimeout(timer)
            timer = setTimeout(update, 120)
        }
        window.addEventListener('resize', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            clearTimeout(timer)
        }
    }, [update])

    return state
}
