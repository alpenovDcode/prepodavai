import MaterialViewer from '@/components/MaterialViewer'

export default function Page({ params }: { params: { id: string, generationId: string } }) {
    return <MaterialViewer lessonId={params.id} generationId={params.generationId} isEditable={true} />
}
