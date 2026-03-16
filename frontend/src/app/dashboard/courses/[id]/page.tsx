import CourseDetailPage from '@/components/CourseDetailPage'

export default function Page({ params }: { params: { id: string } }) {
    return <CourseDetailPage id={params.id} />
}
