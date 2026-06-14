import ReferralsPage from '@/components/ReferralsPage'
import ReferralsPageV2 from '@/components/v2/ReferralsPageV2'

export default function ReferralsRoute() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <ReferralsPageV2 /> : <ReferralsPage />
}
