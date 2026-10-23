import MaterialViewer from '@/components/MaterialViewer'
import MaterialViewerV2 from '@/components/v2/MaterialViewerV2'

export default async function Page({ params }: { params: Promise<{ id: string, generationId: string }> }) {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2
        ? <MaterialViewerV2 lessonId={(await params).id} generationId={(await params).generationId} isEditable />
        : <MaterialViewer lessonId={(await params).id} generationId={(await params).generationId} isEditable={true} />
}
