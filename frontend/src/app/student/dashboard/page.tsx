import StudentDashboardLegacy from '@/components/StudentDashboardLegacy'
import StudentDashboardV2 from '@/components/v2/StudentDashboardV2'
import { StudentLayoutV2 } from '@/components/layout/v2/StudentLayoutV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) return <StudentDashboardLegacy />
    return (
        <StudentLayoutV2>
            <StudentDashboardV2 />
        </StudentLayoutV2>
    )
}
