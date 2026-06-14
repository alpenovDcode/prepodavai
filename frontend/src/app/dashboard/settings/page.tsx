import SettingsPage from '@/components/SettingsPage'
import SettingsPageV2 from '@/components/v2/SettingsPageV2'

export default function Page() {
    const v2 = process.env.NEXT_PUBLIC_REDESIGN_V2 === 'true'
    return v2 ? <SettingsPageV2 /> : <SettingsPage />
}
