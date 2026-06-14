import WorksheetGeneratorLegacy from '@/components/WorksheetGeneratorLegacy'
import WorksheetGeneratorV2 from '@/components/v2/WorksheetGeneratorV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <WorksheetGeneratorV2 /> : <WorksheetGeneratorLegacy />
}
