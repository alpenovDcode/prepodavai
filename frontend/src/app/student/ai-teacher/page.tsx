import StudentAiTeacherLegacy from '@/components/StudentAiTeacherLegacy'
import StudentAiTeacherV2 from '@/components/v2/StudentAiTeacherV2'
import { StudentLayoutV2 } from '@/components/layout/v2/StudentLayoutV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) return <StudentAiTeacherLegacy />
    return (
        <StudentLayoutV2>
            <StudentAiTeacherV2 />
        </StudentLayoutV2>
    )
}
