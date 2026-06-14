import CalendarPage from '@/components/CalendarPage'
import CalendarPageV2 from '@/components/v2/CalendarPageV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <CalendarPageV2 /> : <CalendarPage />
}
