'use client'

import { useParams } from 'next/navigation'

import AssignmentOverviewV2 from '@/components/v2/AssignmentOverviewV2'

export default function AssignmentOverviewPage() {
    const params = useParams<{ id: string }>()
    return <AssignmentOverviewV2 assignmentId={params.id} />
}
