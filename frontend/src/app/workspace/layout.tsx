import WorkspaceLayout from '@/components/workspace/WorkspaceLayout'
import { DashboardLayoutV2Shim } from '@/components/layout/v2/DashboardLayoutV2Shim'
import { WorkspaceShellV2 } from '@/components/v2/WorkspaceShellV2'

export default function Layout({ children }: { children: React.ReactNode }) {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (v2) {
        // V2: единый shell с Sidebar/Cmd+K (DashboardLayoutV2Shim) +
        // Topbar по умолчанию для всех подстраниц инструментов (WorkspaceShellV2).
        return (
            <DashboardLayoutV2Shim>
                <WorkspaceShellV2>{children}</WorkspaceShellV2>
            </DashboardLayoutV2Shim>
        )
    }
    return <WorkspaceLayout>{children}</WorkspaceLayout>
}
