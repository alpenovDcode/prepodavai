'use client'

import { ReactNode, useEffect, useState } from 'react'
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
    // useUser зависит от localStorage → SSR и первый клиентский рендер отдают
    // разные initials/fullName, что ломает гидрацию. Mount-gate подаёт в Sidebar
    // одни и те же безопасные плейсхолдеры на SSR + первый клиентский рендер,
    // а реальные данные подменяет уже после mount.
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])
    const { fullName, initials, user } = useUser()
    const sections = getTeacherNavSections()
    const userProps = mounted
        ? { name: fullName, initials, plan: user?.email }
        : { name: 'Загрузка…', initials: '…', plan: undefined }
    return (
        <DashboardLayoutV2 sections={sections} user={userProps}>
            {children}
        </DashboardLayoutV2>
    )
}
