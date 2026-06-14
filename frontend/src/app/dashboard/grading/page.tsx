import { redirect } from 'next/navigation'
import GradingPageV2 from '@/components/v2/GradingPageV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    if (!v2) {
        redirect('/workspace/homework')
    }
    return <GradingPageV2 />
}
