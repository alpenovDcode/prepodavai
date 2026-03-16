import ClassDetailPage from '@/components/ClassDetailPage'

export default function Page({ params }: { params: { id: string } }) {
    return <ClassDetailPage id={params.id} />
}
