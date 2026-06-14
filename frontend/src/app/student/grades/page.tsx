import StudentGradesLegacy from '@/components/StudentGradesLegacy'
import StudentGradesV2 from '@/components/v2/StudentGradesV2'
import { StudentLayoutV2 } from '@/components/layout/v2/StudentLayoutV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) return <StudentGradesLegacy />
    return (
        <StudentLayoutV2>
            <StudentGradesV2 />
        </StudentLayoutV2>
    )
}
