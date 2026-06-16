'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
    UserCircle, Bell, ShieldCheck, Link as LinkIcon, Palette, Languages,
    Check, Upload, CheckCircle, Send, MessageCircle, Calendar as CalendarIcon, Cloud,
    Sun, Moon, Laptop, Eye, EyeOff, Compass,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { apiClient } from '@/lib/api/client'
import { useUser } from '@/lib/hooks/useUser'
import { useTheme } from '@/lib/hooks/useTheme'
import { Topbar } from '@/components/layout/v2/Topbar'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'
import { TOUR_CONFIGS } from '@/lib/tour/tourSteps'

import { Card } from '@/components/ui/v2/Card'
import { Button } from '@/components/ui/v2/Button'
import { Input } from '@/components/ui/v2/Input'
import { Badge } from '@/components/ui/v2/Badge'
import { Toggle } from '@/components/ui/v2/Toggle'

type NavId =
    | 'profile' | 'notifications' | 'security' | 'integrations'
    | 'appearance' | 'language'

const NAV: { id: NavId; label: string; icon: any; danger?: boolean }[] = [
    { id: 'profile',       label: 'Профиль',         icon: UserCircle },
    { id: 'notifications', label: 'Уведомления',     icon: Bell },
    { id: 'security',      label: 'Безопасность',    icon: ShieldCheck },
    { id: 'integrations',  label: 'Интеграции',      icon: LinkIcon },
    { id: 'language',      label: 'Язык и регион',   icon: Languages },
]

// ─── маленькие переиспользуемые элементы ─────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <label className="block text-[12px] font-semibold text-ink-700 mb-1.5 uppercase tracking-[0.04em]">
            {children}
        </label>
    )
}

function Panel({
    id, title, subtitle, headerExtra, children, noBodyPadding,
}: {
    id: NavId
    title: string
    subtitle?: string
    headerExtra?: React.ReactNode
    children: React.ReactNode
    noBodyPadding?: boolean
}) {
    return (
        <Card id={id} padding="none" className="mb-4 scroll-mt-24">
            <div className="px-[22px] py-[18px] border-b border-ink-100 flex items-end justify-between gap-4">
                <div>
                    <h2 className="font-display text-[16px] font-bold text-ink-900 leading-tight">{title}</h2>
                    {subtitle && <div className="text-[13px] text-ink-500 mt-0.5">{subtitle}</div>}
                </div>
                {headerExtra}
            </div>
            <div className={noBodyPadding ? '' : 'p-[22px]'}>{children}</div>
        </Card>
    )
}

// ─── профиль ─────────────────────────────────────────────────────────────────

type ProfileState = {
    firstName: string
    lastName: string
    email: string
    phone: string
    phoneVerified: boolean
    subject: string
    grades: string
    bio: string
    avatar: string
}

function initialsFrom(first: string, last: string, username?: string) {
    const a = (first || '').trim()[0] || ''
    const b = (last || '').trim()[0] || ''
    if (a || b) return (a + b).toUpperCase()
    return (username || 'U')[0].toUpperCase()
}

// ─── меняем пароль ───────────────────────────────────────────────────────────

function SecurityPanel() {
    const [cur, setCur] = useState('')
    const [next, setNext] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showCur, setShowCur] = useState(false)
    const [showNext, setShowNext] = useState(false)
    const [saving, setSaving] = useState(false)

    const submit = async () => {
        if (next.length < 8) { toast.error('Минимум 8 символов'); return }
        if (next !== confirm) { toast.error('Пароли не совпадают'); return }
        setSaving(true)
        try {
            await apiClient.post('/users/me/password', { currentPassword: cur, newPassword: next })
            toast.success('Пароль изменён')
            setCur(''); setNext(''); setConfirm('')
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сменить пароль')
        } finally { setSaving(false) }
    }

    return (
        <Panel id="security" title="Безопасность" subtitle="Пароль и активные сессии">
            <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <div>
                    <FieldLabel>Текущий пароль</FieldLabel>
                    <Input
                        type={showCur ? 'text' : 'password'}
                        value={cur}
                        onChange={e => setCur(e.target.value)}
                        rightIcon={
                            <button type="button" onClick={() => setShowCur(s => !s)} className="text-ink-500 hover:text-ink-700">
                                {showCur ? <EyeOff size={16}/> : <Eye size={16}/>}
                            </button>
                        }
                    />
                </div>
                <div>
                    <FieldLabel>Новый пароль</FieldLabel>
                    <Input
                        type={showNext ? 'text' : 'password'}
                        value={next}
                        onChange={e => setNext(e.target.value)}
                        hint="Минимум 8 символов"
                        rightIcon={
                            <button type="button" onClick={() => setShowNext(s => !s)} className="text-ink-500 hover:text-ink-700">
                                {showNext ? <EyeOff size={16}/> : <Eye size={16}/>}
                            </button>
                        }
                    />
                </div>
                <div className="col-span-2 max-md:col-span-1">
                    <FieldLabel>Повторите новый пароль</FieldLabel>
                    <Input
                        type={showNext ? 'text' : 'password'}
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex justify-end mt-5">
                <Button variant="secondary" onClick={submit} loading={saving} disabled={!cur || !next || !confirm}>
                    Сменить пароль
                </Button>
            </div>
        </Panel>
    )
}

// ─── интеграции ──────────────────────────────────────────────────────────────

type PlatformInfo = { linked: boolean; platformId: string | null; platformName: string | null }
type Platforms = { telegram: PlatformInfo; max: PlatformInfo } | null

function IntegrationCard({
    color, gradient, icon: Icon, title, desc, action,
}: {
    color?: string
    gradient?: string
    icon: any
    title: string
    desc: string
    action: React.ReactNode
}) {
    return (
        <div className="border border-ink-200 rounded-md p-3.5 flex items-center gap-3 min-w-0">
            <div
                className="w-10 h-10 rounded-md flex items-center justify-center text-white shrink-0"
                style={{ background: gradient || color }}
            >
                <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-ink-900 text-sm truncate">{title}</div>
                <div className="text-[12px] text-ink-500 mt-0.5 truncate">{desc}</div>
            </div>
            <div className="shrink-0 ml-auto">{action}</div>
        </div>
    )
}

function IntegrationsPanel() {
    const [platforms, setPlatforms] = useState<Platforms>(null)
    const [loading, setLoading] = useState(true)
    const [linking, setLinking] = useState<{ platform: 'telegram' | 'max'; link: string } | null>(null)
    const [unlinkingFor, setUnlinkingFor] = useState<'telegram' | 'max' | null>(null)
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const fetchPlatforms = useCallback(async () => {
        try {
            const res = await apiClient.get('/auth/platforms')
            if (res.data?.success) setPlatforms(res.data.platforms)
        } finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchPlatforms() }, [fetchPlatforms])
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    const startLink = async (platform: 'telegram' | 'max') => {
        try {
            const res = await apiClient.post('/auth/link-token', { platform })
            if (!res.data?.success) { toast.error('Не удалось получить токен'); return }
            setLinking({ platform, link: res.data.deepLink })
            const token = res.data.token
            pollRef.current = setInterval(async () => {
                try {
                    const poll = await apiClient.get(`/auth/link-status?token=${token}`)
                    if (poll.data.status === 'completed') {
                        clearInterval(pollRef.current!)
                        await fetchPlatforms()
                        setLinking(null)
                        toast.success(platform === 'telegram' ? 'Telegram подключён' : 'MAX подключён')
                    } else if (poll.data.status === 'expired') {
                        clearInterval(pollRef.current!)
                        setLinking(null)
                        toast.error('Срок токена истёк, попробуйте снова')
                    }
                } catch { /* ignore */ }
            }, 2000)
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Ошибка генерации токена')
        }
    }

    const unlink = async (platform: 'telegram' | 'max') => {
        setUnlinkingFor(platform)
        try {
            await apiClient.delete(`/auth/unlink/${platform}`)
            await fetchPlatforms()
            toast.success('Отвязано')
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Ошибка отвязки')
        } finally { setUnlinkingFor(null) }
    }

    const renderLinkAction = (platform: 'telegram' | 'max') => {
        const info = platforms?.[platform]
        if (loading) return <span className="text-[12px] text-ink-400">…</span>
        if (info?.linked) {
            return (
                <div className="flex items-center gap-2">
                    <Badge variant="success">подключён</Badge>
                    <Button
                        variant="ghost"
                        size="sm"
                        loading={unlinkingFor === platform}
                        onClick={() => unlink(platform)}
                    >
                        Отвязать
                    </Button>
                </div>
            )
        }
        return (
            <Button variant="secondary" size="sm" onClick={() => startLink(platform)}>
                Подключить
            </Button>
        )
    }

    const tgUser = platforms?.telegram?.platformName || platforms?.telegram?.platformId
    const maxUser = platforms?.max?.platformName || platforms?.max?.platformId

    return (
        <Panel id="integrations" title="Интеграции" subtitle="Telegram, MAX и внешние сервисы">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                <IntegrationCard
                    color="#0088CC"
                    icon={Send}
                    title="Telegram"
                    desc={platforms?.telegram?.linked ? (tgUser ? `@${tgUser} · бот привязан` : 'Бот привязан') : 'Получайте уведомления в боте'}
                    action={renderLinkAction('telegram')}
                />
                <IntegrationCard
                    gradient="linear-gradient(135deg,#5B47FB,#9747FB)"
                    icon={MessageCircle}
                    title="MAX"
                    desc={platforms?.max?.linked ? (maxUser ? `${maxUser} · бот привязан` : 'Бот привязан') : 'Альтернатива Telegram'}
                    action={renderLinkAction('max')}
                />
            </div>

            {linking && (
                <div className="mt-4 p-3 border border-brand-200 bg-brand-50 rounded-md text-[13px] text-ink-700 flex items-center gap-3 flex-wrap">
                    <span>Откройте бота и нажмите «Старт». Ждём подтверждения…</span>
                    <a href={linking.link} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">
                        Открыть {linking.platform === 'telegram' ? 'Telegram' : 'MAX'}
                    </a>
                </div>
            )}
        </Panel>
    )
}

// ─── внешний вид ─────────────────────────────────────────────────────────────

function AppearancePanel() {
    const { theme, setTheme } = useTheme()
    const opts: { id: 'light' | 'dark' | 'system'; label: string; icon: any }[] = [
        { id: 'light',  label: 'Светлая',   icon: Sun },
        { id: 'dark',   label: 'Тёмная',    icon: Moon },
        { id: 'system', label: 'Системная', icon: Laptop },
    ]
    return (
        <Panel id="appearance" title="Внешний вид" subtitle="Цветовая схема интерфейса">
            <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
                {opts.map(opt => {
                    const Icon = opt.icon
                    const active = theme === opt.id
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            onClick={() => setTheme(opt.id)}
                            className={`flex items-center gap-3 p-4 rounded-md border-2 text-left transition-all ${
                                active ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300 bg-surface'
                            }`}
                        >
                            <Icon className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-ink-500'}`} />
                            <div className={`font-semibold text-sm ${active ? 'text-brand-700' : 'text-ink-900'}`}>
                                {opt.label}
                            </div>
                        </button>
                    )
                })}
            </div>
        </Panel>
    )
}

// ─── главный компонент ───────────────────────────────────────────────────────

export default function SettingsPageV2() {
    const menu = useMobileMenu()
    const tour = useTour()
    const { user, refetch } = useUser() as any

    const [active, setActive] = useState<NavId>('profile')
    const [loaded, setLoaded] = useState(false)
    const [saving, setSaving] = useState(false)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const [profile, setProfile] = useState<ProfileState>({
        firstName: '', lastName: '', email: '', phone: '',
        phoneVerified: false, subject: '', grades: '', bio: '', avatar: '',
    })

    const [notif, setNotif] = useState({
        notifyStudentProgress: false,
        notifyWeeklyReport: true,
        notifyNewCourse: true,
    })

    // первоначальная загрузка профиля (берём напрямую, чтобы получить полный набор полей)
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await apiClient.get('/users/me')
                if (cancelled || !res.data?.success || !res.data.user) return
                const u = res.data.user
                setProfile({
                    firstName: u.firstName || '',
                    lastName: u.lastName || '',
                    email: u.email || '',
                    phone: u.phone || '',
                    phoneVerified: !!u.phoneVerified,
                    subject: u.subject || '',
                    grades: u.grades || '',
                    bio: u.bio || '',
                    avatar: u.avatar || '',
                })
                setNotif({
                    notifyStudentProgress: u.notifyStudentProgress ?? false,
                    notifyWeeklyReport: u.notifyWeeklyReport ?? true,
                    notifyNewCourse: u.notifyNewCourse ?? true,
                })
            } catch {
                toast.error('Не удалось загрузить профиль')
            } finally {
                if (!cancelled) setLoaded(true)
            }
        })()
        return () => { cancelled = true }
    }, [])

    // отслеживаем активную секцию по скроллу
    useEffect(() => {
        const obs = new IntersectionObserver(
            entries => {
                const visible = entries
                    .filter(e => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
                if (visible?.target?.id) setActive(visible.target.id as NavId)
            },
            { rootMargin: '-100px 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] },
        )
        NAV.forEach(n => {
            const el = document.getElementById(n.id)
            if (el) obs.observe(el)
        })
        return () => obs.disconnect()
    }, [loaded])

    const scrollTo = (id: NavId) => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const saveAll = async () => {
        setSaving(true)
        try {
            await apiClient.put('/users/me', {
                firstName: profile.firstName,
                lastName: profile.lastName,
                email: profile.email || undefined,
                phone: profile.phone || undefined,
                subject: profile.subject,
                grades: profile.grades,
                bio: profile.bio,
                notifyStudentProgress: notif.notifyStudentProgress,
                notifyWeeklyReport: notif.notifyWeeklyReport,
                notifyNewCourse: notif.notifyNewCourse,
            })
            await refetch?.()
            toast.success('Сохранено')
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Не удалось сохранить')
        } finally { setSaving(false) }
    }

    const onUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingAvatar(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const up = await apiClient.post('/files/upload', fd)
            if (!up.data?.success) throw new Error('upload failed')
            const hash = up.data.hash
            await apiClient.put('/users/me', { avatar: hash })
            setProfile(p => ({ ...p, avatar: hash }))
            await refetch?.()
            toast.success('Аватар обновлён')
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Ошибка загрузки')
        } finally {
            setUploadingAvatar(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    const removeAvatar = async () => {
        try {
            await apiClient.put('/users/me', { avatar: '' })
            setProfile(p => ({ ...p, avatar: '' }))
            await refetch?.()
            toast.success('Фото удалено')
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Ошибка')
        }
    }

    const initials = initialsFrom(profile.firstName, profile.lastName, user?.username)
    const displayName = `${profile.firstName} ${profile.lastName}`.trim() || user?.username || 'Пользователь'
    const joinedSuffix = user?.email ? ` · ${user.email}` : ''
    const avatarSrc = profile.avatar ? `${apiClient.defaults.baseURL}/files/${profile.avatar}` : null

    return (
        <>
            <Topbar
                title="Настройки"
                subtitle="Профиль, уведомления, интеграции и аккаунт"
                onMobileMenuToggle={menu.toggle}
                hideSearch
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" leftIcon={<Compass size={14} />} onClick={tour.start}>
                            Тур
                        </Button>
                        <Button variant="primary" size="sm" leftIcon={<Check size={14} />} onClick={saveAll} loading={saving}>
                            Сохранить
                        </Button>
                    </div>
                }
            />

            <div className="max-w-[1240px] w-full mx-auto p-8 max-md:p-4">
                <div className="grid gap-8 [grid-template-columns:240px_minmax(0,1fr)] items-start max-lg:grid-cols-1">

                    {/* ─── Левая навигация ─── */}
                    <nav data-tour="left-nav" className="bg-surface border border-ink-200 rounded-lg p-2 sticky top-[88px] self-start max-lg:static">
                        {NAV.map(n => {
                            const Icon = n.icon
                            const isActive = active === n.id
                            const colorCls = n.danger
                                ? 'text-danger-700'
                                : isActive
                                    ? 'bg-brand-50 text-brand-700'
                                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                            return (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => scrollTo(n.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-[13px] font-semibold transition-colors ${colorCls}`}
                                >
                                    <Icon size={16} className={n.danger ? 'text-danger-500' : ''} />
                                    <span className="truncate">{n.label}</span>
                                </button>
                            )
                        })}
                    </nav>

                    {/* ─── Контент ─── */}
                    <div className="min-w-0">

                        {/* Профиль */}
                        <Panel id="profile" title="Профиль" subtitle="Как вас увидят ученики и коллеги">
                            <div className="flex items-center gap-4 pb-[18px] border-b border-ink-100 mb-[18px] flex-wrap">
                                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center font-display font-extrabold text-[22px] shrink-0 overflow-hidden">
                                    {avatarSrc ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={avatarSrc} alt={displayName} className="w-full h-full object-cover" />
                                    ) : (
                                        initials
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-[15px] text-ink-900 truncate">{displayName}</div>
                                    <div className="text-[12px] text-ink-500 mt-0.5 truncate">
                                        @{user?.username || '—'}{joinedSuffix}
                                    </div>
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={onUploadAvatar}
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Upload size={14} />}
                                    loading={uploadingAvatar}
                                    onClick={() => fileRef.current?.click()}
                                >
                                    Загрузить фото
                                </Button>
                                {profile.avatar && (
                                    <Button variant="ghost" size="sm" onClick={removeAvatar}>
                                        Удалить
                                    </Button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-3.5 max-sm:grid-cols-1">
                                <div>
                                    <FieldLabel>Имя</FieldLabel>
                                    <Input value={profile.firstName} onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} />
                                </div>
                                <div>
                                    <FieldLabel>Фамилия</FieldLabel>
                                    <Input value={profile.lastName} onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-3.5 max-sm:grid-cols-1">
                                <div>
                                    <FieldLabel>Email</FieldLabel>
                                    <Input
                                        type="email"
                                        value={profile.email}
                                        onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                                        hint={user?.email ? 'Используется для входа' : undefined}
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Телефон</FieldLabel>
                                    <Input
                                        value={profile.phone}
                                        onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                                    />
                                    {profile.phone && profile.phoneVerified && (
                                        <div className="text-[12px] mt-1.5 text-success-700 flex items-center gap-1">
                                            <CheckCircle size={12} /> Подтверждён
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-3.5 max-sm:grid-cols-1">
                                <div>
                                    <FieldLabel>Предметы</FieldLabel>
                                    <Input
                                        value={profile.subject}
                                        onChange={e => setProfile(p => ({ ...p, subject: e.target.value }))}
                                        placeholder="Математика, Физика"
                                    />
                                </div>
                                <div>
                                    <FieldLabel>Классы</FieldLabel>
                                    <Input
                                        value={profile.grades}
                                        onChange={e => setProfile(p => ({ ...p, grades: e.target.value }))}
                                        placeholder="5–9 классы"
                                    />
                                </div>
                            </div>

                            <div>
                                <FieldLabel>О себе</FieldLabel>
                                <textarea
                                    value={profile.bio}
                                    onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                                    placeholder="Несколько слов о себе для приветственного письма ученикам"
                                    className="w-full min-h-[88px] resize-y rounded-md bg-surface text-sm text-ink-900 border border-ink-200 px-3 py-2.5 placeholder:text-ink-400 focus:outline-none focus:ring-[3px] focus:border-brand-400 focus:ring-brand-400/15 transition-all font-inherit"
                                />
                            </div>
                        </Panel>

                        {/* Уведомления */}
                        <Panel id="notifications" title="Уведомления" subtitle="Когда и о чём сообщать" noBodyPadding>
                            <div className="px-[22px]">
                                {[
                                    {
                                        key: 'notifyStudentProgress',
                                        title: 'Ученик сдал работу',
                                        desc: 'Email + Telegram — как только появится новая работа',
                                    },
                                    {
                                        key: 'notifyWeeklyReport',
                                        title: 'Дайджест по итогам недели',
                                        desc: 'Каждый понедельник — что было, что предстоит',
                                    },
                                    {
                                        key: 'notifyNewCourse',
                                        title: 'Новые возможности продукта',
                                        desc: 'Раз в 2 недели — что нового, что улучшили',
                                    },
                                ].map((r, idx, arr) => (
                                    <div
                                        key={r.key}
                                        className={`flex items-center justify-between gap-3 py-3.5 ${
                                            idx < arr.length - 1 ? 'border-b border-ink-100' : ''
                                        }`}
                                    >
                                        <div className="flex-1 pr-4 min-w-0">
                                            <div className="font-semibold text-ink-900 text-sm">{r.title}</div>
                                            <div className="text-[12px] text-ink-500 mt-0.5 leading-relaxed">{r.desc}</div>
                                        </div>
                                        <Toggle
                                            checked={(notif as any)[r.key]}
                                            onChange={v => setNotif(n => ({ ...n, [r.key]: v }))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </Panel>

                        {/* Безопасность */}
                        <SecurityPanel />

                        {/* Интеграции */}
                        <IntegrationsPanel />

                        {/* Язык и регион */}
                        <Panel id="language" title="Язык и регион" subtitle="Скоро будет выбор языка интерфейса">
                            <div className="text-[13px] text-ink-500 mb-5">
                                Сейчас интерфейс доступен только на русском. Английская версия в работе.
                            </div>
                            <div data-tour="tour-reset" className="flex items-center justify-between gap-3 pt-4 border-t border-ink-100 flex-wrap">
                                <div>
                                    <div className="font-semibold text-ink-900 text-sm">Сбросить все туры</div>
                                    <div className="text-[12px] text-ink-500 mt-0.5">Туры снова запустятся при первом посещении каждой страницы</div>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    leftIcon={<Compass size={14} />}
                                    onClick={() => {
                                        Object.values(TOUR_CONFIGS).forEach(c => localStorage.removeItem(c.storageKey))
                                        toast.success('Все туры сброшены — зайдите на любую страницу, чтобы пройти заново')
                                    }}
                                >
                                    Сбросить туры
                                </Button>
                            </div>
                        </Panel>

                    </div>
                </div>
            </div>
        </>
    )
}
