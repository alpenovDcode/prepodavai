import GamesLegacy from '@/components/GamesLegacy'
import GamesV2 from '@/components/v2/GamesV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <GamesV2 /> : <GamesLegacy />
}
