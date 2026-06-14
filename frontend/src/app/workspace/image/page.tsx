import ImageGeneratorLegacy from '@/components/ImageGeneratorLegacy'
import ImageGeneratorV2 from '@/components/v2/ImageGeneratorV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <ImageGeneratorV2 /> : <ImageGeneratorLegacy />
}
