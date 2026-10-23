import ClassDetailPage from '@/components/ClassDetailPage'
import ClassDetailPageV2 from '@/components/v2/ClassDetailPageV2'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    if (process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true') {
        return <ClassDetailPageV2 id={(await params).id} />
    }
    return <ClassDetailPage id={(await params).id} />
}
