import ClassDetailPage from '@/components/ClassDetailPage'
import ClassDetailPageV2 from '@/components/v2/ClassDetailPageV2'

export default function Page({ params }: { params: { id: string } }) {
    if (process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true') {
        return <ClassDetailPageV2 id={params.id} />
    }
    return <ClassDetailPage id={params.id} />
}
