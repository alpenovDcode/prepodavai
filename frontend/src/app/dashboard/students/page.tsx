import StudentsPage from '@/components/StudentsPage'
import StudentsPageV2 from '@/components/v2/StudentsPageV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <StudentsPageV2 /> : <StudentsPage />
}
