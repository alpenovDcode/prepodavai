import { DashboardLayoutV2Shim } from '@/components/layout/v2/DashboardLayoutV2Shim'

export default function Layout({ children }: { children: React.ReactNode }) {
    return <DashboardLayoutV2Shim>{children}</DashboardLayoutV2Shim>
}
