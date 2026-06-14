'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'prepodavai_theme'
export type Theme = 'light' | 'dark' | 'system'

function resolveTheme(t: Theme): 'light' | 'dark' {
    if (t === 'system') {
        if (typeof window === 'undefined') return 'light'
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return t
}

function applyTheme(t: Theme) {
    if (typeof document === 'undefined') return
    const resolved = resolveTheme(t)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
}

/**
 * Минимальный theme provider — без context, через localStorage + html.classList.
 * Используется только для v2 (legacy не трогает .dark класс).
 */
export function useTheme() {
    const [theme, setThemeState] = useState<Theme>('light')

    useEffect(() => {
        const stored = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Theme | null
        const t: Theme = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'light'
        setThemeState(t)
        applyTheme(t)
    }, [])

    useEffect(() => {
        if (theme !== 'system') return
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => applyTheme('system')
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [theme])

    const setTheme = (t: Theme) => {
        setThemeState(t)
        if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, t)
        applyTheme(t)
    }

    return { theme, setTheme }
}
