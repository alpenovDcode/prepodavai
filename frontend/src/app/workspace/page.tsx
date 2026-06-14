import WorkspaceHub from '@/components/WorkspaceHub'
import WorkspaceHubV2 from '@/components/v2/WorkspaceHubV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <WorkspaceHubV2 /> : <WorkspaceHub />
}
