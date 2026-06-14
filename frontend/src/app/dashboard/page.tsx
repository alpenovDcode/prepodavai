import DashboardHome from '@/components/DashboardHome'
import DashboardHomeV2 from '@/components/v2/DashboardHomeV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <DashboardHomeV2 /> : <DashboardHome />
}
