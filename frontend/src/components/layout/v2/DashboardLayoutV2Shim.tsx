'use client'

import { ReactNode } from 'react'
import { useUser } from '@/lib/hooks/useUser'
import { DashboardLayoutV2 } from './DashboardLayoutV2'
import { getTeacherNavSections } from './Sidebar'
import LegacyDashboardLayout from '@/components/DashboardLayout'

/**
 * Shim, выбирающий между legacy- и v2-layout по фича-флагу NEXT_PUBLIC_REDESIGN_V2.
 *
 * При REDESIGN_V2=true — оборачивает контент в новый DashboardLayoutV2
 * (Sidebar + Topbar встраивает каждая страница самостоятельно, потому что
 * заголовок/действия — её ответственность).
 *
 * Иначе — отдаёт текущий legacy-layout без изменений.
 */
export function DashboardLayoutV2Shim({ children }: { children: ReactNode }) {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) {
        return <LegacyDashboardLayout>{children}</LegacyDashboardLayout>
    }
    return <DashboardLayoutV2Inner>{children}</DashboardLayoutV2Inner>
}

function DashboardLayoutV2Inner({ children }: { children: ReactNode }) {
    const { fullName, initials, user } = useUser()
    const sections = getTeacherNavSections()
    return (
        <DashboardLayoutV2
            sections={sections}
            user={{
                name: fullName,
                initials,
                plan: user?.email,
            }}
        >
            {children}
        </DashboardLayoutV2>
    )
}
