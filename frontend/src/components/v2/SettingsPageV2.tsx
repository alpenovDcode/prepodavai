'use client'

import { useEffect, useState } from 'react'
import { User, Bell, Shield, LogOut, Save, Palette, Sun, Moon, Laptop } from 'lucide-react'
import { useTheme } from '@/lib/hooks/useTheme'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useUser } from '@/lib/hooks/useUser'
import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Avatar } from '@/components/ui/v2/Avatar'
import { Toggle } from '@/components/ui/v2/Toggle'
import { Tabs } from '@/components/ui/v2/Tabs'

type TabKey = 'profile' | 'notifications' | 'appearance' | 'security'

function AppearanceSection() {
    const { theme, setTheme } = useTheme()
    const options: { id: 'light' | 'dark' | 'system'; label: string; icon: any }[] = [
        { id: 'light',  label: 'Светлая', icon: Sun },
        { id: 'dark',   label: 'Тёмная',  icon: Moon },
        { id: 'system', label: 'Системная', icon: Laptop },
    ]
    return (
        <Card padding="lg">
            <h3 className="font-display font-bold text-ink-900 mb-1">Тема</h3>
            <p className="text-[13px] text-ink-500 mb-4">Цветовая схема интерфейса.</p>
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                {options.map(opt => {
                    const Icon = opt.icon
                    const active = theme === opt.id
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setTheme(opt.id)}
                            className={`flex items-center gap-3 p-4 rounded-md border-2 text-left transition-all ${
                                active
                                    ? 'border-brand-500 bg-brand-50'
                                    : 'border-ink-200 hover:border-ink-300 bg-surface'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-ink-500'}`} />
                            <div>
                                <div className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>
                                    {opt.label}
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </Card>
    )
}

function NotificationsSection() {
    const [notif, setNotif] = useState({
        emailSubmissions: true,
        emailDigest: false,
        telegram: true,
        browserPush: false,
    })
    const upd = <K extends keyof typeof notif>(k: K, v: boolean) => setNotif(s => ({ ...s, [k]: v }))
    return (
        <Card padding="lg" className="flex flex-col gap-4">
            <Toggle label="Email — уведомления о сдаче ДЗ" description="Письмо когда ученик сдал работу на проверку"
                checked={notif.emailSubmissions} onChange={v => upd('emailSubmissions', v)} />
            <Toggle label="Email — еженедельный дайджест" description="Сводка активности класса каждое воскресенье"
                checked={notif.emailDigest} onChange={v => upd('emailDigest', v)} />
            <Toggle label="Telegram-бот" description="Уведомления через бота @prepodavai_bot"
                checked={notif.telegram} onChange={v => upd('telegram', v)} />
            <Toggle label="Push (браузер)" description="Системные уведомления в браузере"
                checked={notif.browserPush} onChange={v => upd('browserPush', v)} />
        </Card>
    )
}

export default function SettingsPageV2() {
    const menu = useMobileMenu()
    const { user, fullName, refetch } = useUser()

    const [tab, setTab] = useState<TabKey>('profile')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [email, setEmail] = useState('')
    const [bio, setBio] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (user) {
            setFirstName(user.firstName || '')
            setLastName(user.lastName || '')
            setEmail(user.email || '')
            setBio(user.bio || '')
        }
    }, [user])

    const saveProfile = async () => {
        setSaving(true)
        try {
            await apiClient.patch('/users/me', { firstName, lastName, email, bio })
            await refetch()
            toast.success('Профиль сохранён')
        } catch {
            toast.error('Не удалось сохранить')
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <Topbar
                title="Настройки"
                subtitle="Профиль, уведомления, внешний вид, безопасность"
                onMobileMenuToggle={menu.toggle}
                hideSearch
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <Tabs
                    variant="underline"
                    items={[
                        { id: 'profile',       label: 'Профиль',      icon: <User className="w-4 h-4" /> },
                        { id: 'notifications', label: 'Уведомления',  icon: <Bell className="w-4 h-4" /> },
                        { id: 'appearance',    label: 'Внешний вид',  icon: <Palette className="w-4 h-4" /> },
                        { id: 'security',      label: 'Безопасность', icon: <Shield className="w-4 h-4" /> },
                    ]}
                    active={tab}
                    onChange={(k) => setTab(k as TabKey)}
                />

                <div className="mt-6 grid gap-4 max-w-[720px]">
                    {tab === 'profile' && (
                        <>
                            <Card padding="lg">
                                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-ink-100">
                                    <Avatar name={fullName} size="xl" />
                                    <div>
                                        <h3 className="font-display font-bold text-[18px] text-ink-900">{fullName}</h3>
                                        <p className="text-[13px] text-ink-500">{user?.email || (user?.username && `@${user.username}`)}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                                    <Input label="Имя" value={firstName} onChange={e => setFirstName(e.target.value)} />
                                    <Input label="Фамилия" value={lastName} onChange={e => setLastName(e.target.value)} />
                                    <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="col-span-2 max-md:col-span-1" />
                                    <Input label="О себе" value={bio} onChange={e => setBio(e.target.value)} className="col-span-2 max-md:col-span-1" hint="Краткое описание, видно ученикам." />
                                </div>
                                <div className="flex justify-end mt-6">
                                    <Button variant="primary" onClick={saveProfile} loading={saving} leftIcon={<Save className="w-4 h-4" />}>
                                        Сохранить
                                    </Button>
                                </div>
                            </Card>
                        </>
                    )}

                    {tab === 'notifications' && <NotificationsSection />}

                    {tab === 'appearance' && <AppearanceSection />}

                    {tab === 'security' && (
                        <Card padding="lg" className="flex flex-col gap-5">
                            <div>
                                <h3 className="font-display font-bold text-ink-900 mb-1">Пароль</h3>
                                <p className="text-[13px] text-ink-500 mb-3">Последнее изменение — давно.</p>
                                <Button variant="secondary">Сменить пароль</Button>
                            </div>
                            <div className="pt-5 border-t border-ink-100">
                                <h3 className="font-display font-bold text-ink-900 mb-1">Активные сессии</h3>
                                <p className="text-[13px] text-ink-500 mb-3">Выйти из всех устройств, кроме текущего.</p>
                                <Button variant="danger" leftIcon={<LogOut className="w-4 h-4" />}>
                                    Завершить остальные сессии
                                </Button>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </>
    )
}
