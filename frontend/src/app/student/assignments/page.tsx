import { redirect } from 'next/navigation'
import StudentAssignmentsListV2 from '@/components/v2/StudentAssignmentsListV2'
import { StudentLayoutV2 } from '@/components/layout/v2/StudentLayoutV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) {
        redirect('/student/dashboard')
    }
    return (
        <StudentLayoutV2>
            <StudentAssignmentsListV2 />
        </StudentLayoutV2>
    )
}
