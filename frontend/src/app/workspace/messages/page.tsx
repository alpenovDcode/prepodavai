import MessagesLegacy from '@/components/MessagesLegacy'
import MessagesV2 from '@/components/v2/MessagesV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <MessagesV2 /> : <MessagesLegacy />
}
