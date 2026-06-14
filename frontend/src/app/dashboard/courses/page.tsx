import CoursesPage from '@/components/CoursesPage'
import CoursesPageV2 from '@/components/v2/CoursesPageV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <CoursesPageV2 /> : <CoursesPage />
}
