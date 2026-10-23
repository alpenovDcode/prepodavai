import { LeadDetails } from '@/components/tutor-exchange/LeadDetails'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <LeadDetails leadId={id} />
}
