'use client'

import { ReactNode, useState, createContext, useContext, useEffect } from 'react'
import { Sidebar, NavSection, SidebarUserInfo } from './Sidebar'
import { CommandPalette } from '@/components/v2/CommandPalette'

export interface DashboardLayoutV2Props {
    children: ReactNode
    sections: NavSection[]
    user: SidebarUserInfo
}

const LayoutContext = createContext<{
    toggleMobileMenu: () => void
    openCommandPalette: () => void
    sidebarCollapsed: boolean
    toggleSidebarCollapsed: () => void
} | null>(null)

export function useMobileMenu(): { toggle: () => void } {
    const ctx = useContext(LayoutContext)
    return { toggle: ctx?.toggleMobileMenu ?? (() => {}) }
}

export function useCommandPalette(): { open: () => void } {
    const ctx = useContext(LayoutContext)
    return { open: ctx?.openCommandPalette ?? (() => {}) }
}

export function useSidebarCollapsed(): { collapsed: boolean; toggle: () => void } {
    const ctx = useContext(LayoutContext)
    return {
        collapsed: ctx?.sidebarCollapsed ?? false,
        toggle: ctx?.toggleSidebarCollapsed ?? (() => {}),
    }
}

const STORAGE_KEY = 'sidebar_collapsed_v2'

/**
 * Корневой layout для всех учительских страниц (v2).
 * Sidebar + content area + Cmd+K palette + контекст.
 */
export function DashboardLayoutV2({ children, sections, user }: DashboardLayoutV2Props) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [collapsed, setCollapsed] = useState<boolean>(false)

    useEffect(() => {
        try {
            const v = localStorage.getItem(STORAGE_KEY)
            if (v === '1') setCollapsed(true)
        } catch {}
    }, [])

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                setPaletteOpen(p => !p)
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [])

    const toggleCollapsed = () => {
        setCollapsed(v => {
            const next = !v
            try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
            return next
        })
    }

    return (
        <LayoutContext.Provider value={{
            toggleMobileMenu: () => setMobileOpen(v => !v),
            openCommandPalette: () => setPaletteOpen(true),
            sidebarCollapsed: collapsed,
            toggleSidebarCollapsed: toggleCollapsed,
        }}>
            <div className="v2 min-h-screen bg-ink-50 flex">
                <Sidebar
                    sections={sections}
                    user={user}
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                    collapsed={collapsed}
                    onToggleCollapsed={toggleCollapsed}
                />
                <main className="flex-1 min-w-0 flex flex-col">
                    {children}
                </main>
            </div>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </LayoutContext.Provider>
    )
}
