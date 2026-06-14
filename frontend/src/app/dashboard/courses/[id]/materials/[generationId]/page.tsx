import MaterialViewer from '@/components/MaterialViewer'
import MaterialViewerV2 from '@/components/v2/MaterialViewerV2'

export default function Page({ params }: { params: { id: string, generationId: string } }) {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2
        ? <MaterialViewerV2 lessonId={params.id} generationId={params.generationId} isEditable />
        : <MaterialViewer lessonId={params.id} generationId={params.generationId} isEditable={true} />
}
