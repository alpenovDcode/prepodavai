import CourseDetailPage from '@/components/CourseDetailPage'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    return <CourseDetailPage id={(await params).id} />
}
