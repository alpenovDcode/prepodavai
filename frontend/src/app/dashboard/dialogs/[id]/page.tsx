import { DialogRoom } from '@/components/tutor-exchange/DialogRoom'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <DialogRoom dialogId={id} />
}
