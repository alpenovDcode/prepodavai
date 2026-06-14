'use client'

import { ReactNode, createContext, useContext, useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { StudentSidebar, StudentInfo, getStudentNavSections } from './StudentSidebar'

interface StudentProfile {
    id: string
    name: string
    className?: string | null
    /** Streak дней — из gamification. */
    streakDays?: number
    /** Опыт — из gamification. */
    xp?: number
}

const fetcher = (url: string) => apiClient.get(url).then((r: any) => r.data)

const MobileMenuContext = createContext<{ toggle: () => void } | null>(null)

export function useStudentMobileMenu() {
    return useContext(MobileMenuContext) ?? { toggle: () => {} }
}

/**
 * V2-layout для студенческих страниц.
 * Загружает профиль ученика + бэйджи, оборачивает контент в Sidebar + content area.
 * Topbar встраивается в каждую страницу (она знает свой title/actions).
 */
export function StudentLayoutV2({ children }: { children: ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false)

    const { data: profile } = useSWR<StudentProfile>('/students/me', fetcher)
    const { data: assignments } = useSWR<any[]>('/assignments/my', fetcher)

    const pendingAssignments = Array.isArray(assignments)
        ? assignments.filter((a: any) => {
            const subs = a.submissions ?? []
            const last = subs[subs.length - 1]
            return !last || last.status === 'rejected'
        }).length
        : 0

    const student: StudentInfo = {
        name: profile?.name ?? 'Ученик',
        className: profile?.className ?? undefined,
        streakDays: profile?.streakDays ?? 0,
        xp: profile?.xp ?? 0,
    }

    const sections = getStudentNavSections({ assignments: pendingAssignments })

    return (
        <MobileMenuContext.Provider value={{ toggle: () => setMobileOpen(v => !v) }}>
            <div className="v2 min-h-screen bg-ink-50 flex">
                <StudentSidebar
                    sections={sections}
                    student={student}
                    open={mobileOpen}
                    onClose={() => setMobileOpen(false)}
                />
                <main className="flex-1 min-w-0 flex flex-col">
                    {children}
                </main>
            </div>
        </MobileMenuContext.Provider>
    )
}
