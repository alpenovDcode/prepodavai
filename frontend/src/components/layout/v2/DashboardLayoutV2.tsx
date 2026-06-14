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
} | null>(null)

export function useMobileMenu(): { toggle: () => void } {
    const ctx = useContext(LayoutContext)
    return { toggle: ctx?.toggleMobileMenu ?? (() => {}) }
}

export function useCommandPalette(): { open: () => void } {
    const ctx = useContext(LayoutContext)
    return { open: ctx?.openCommandPalette ?? (() => {}) }
}

/**
 * Корневой layout для всех учительских страниц (v2).
 * Sidebar + content area + Cmd+K palette + контекст.
 */
export function DashboardLayoutV2({ children, sections, user }: DashboardLayoutV2Props) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const [paletteOpen, setPaletteOpen] = useState(false)

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

    return (
        <LayoutContext.Provider value={{
            toggleMobileMenu: () => setMobileOpen(v => !v),
            openCommandPalette: () => setPaletteOpen(true),
        }}>
            <div className="v2 min-h-screen bg-ink-50 flex">
                <Sidebar
                    sections={sections}
                    user={user}
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                />
                <main className="flex-1 min-w-0 flex flex-col">
                    {children}
                </main>
            </div>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </LayoutContext.Provider>
    )
}
