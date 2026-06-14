import VocabularyLegacy from '@/components/VocabularyLegacy'
import VocabularyV2 from '@/components/v2/VocabularyV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <VocabularyV2 /> : <VocabularyLegacy />
}
