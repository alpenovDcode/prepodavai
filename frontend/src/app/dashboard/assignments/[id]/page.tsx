'use client'

import AssignmentOverviewV2 from '@/components/v2/AssignmentOverviewV2'

export default function AssignmentOverviewPage({ params }: { params: { id: string } }) {
    return <AssignmentOverviewV2 assignmentId={params.id} />
}
