import { redirect } from 'next/navigation'
import AnalyticsPageV2 from '@/components/v2/AnalyticsPageV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) {
        redirect('/dashboard')
    }
    return <AnalyticsPageV2 />
}
