'use client'

import Link from 'next/link'
import {
    MessageSquare,
    Loader2,
    AlertCircle,
    ArrowRight,
    CircleDot,
    CalendarClock,
    Coins,
    CheckCircle2,
    XCircle,
    ShieldAlert,
    ChevronRight,
    Compass,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMyDialogs, DialogListItem } from '@/hooks/tutor-exchange/useMyDialogs'
import { useUser } from '@/lib/hooks/useUser'
import { Topbar } from '@/components/layout/v2/Topbar'
import { Button } from '@/components/ui/v2/Button'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'

type StatusMeta = {
    label: string
    tone: string        // dot + text color
    chip: string        // chip bg/border classes
    Icon: React.ComponentType<{ className?: string }>
}

const STATUS: Record<DialogListItem['status'], StatusMeta> = {
    OPEN:            { label: 'Открыт',            tone: 'text-info-700',    chip: 'bg-info-50 text-info-700 ring-1 ring-inset ring-info-500/20',       Icon: CircleDot },
    TRIAL_PENDING:   { label: 'Пробный урок',      tone: 'text-brand-700',   chip: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-400/30',     Icon: CalendarClock },
    PAYMENT_PENDING: { label: 'Ожидание оплаты',   tone: 'text-warning-700', chip: 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-500/25', Icon: Coins },
    CONFIRMED:       { label: 'Сделка закрыта',    tone: 'text-success-700', chip: 'bg-success-50 text-success-700 ring-1 ring-inset ring-success-500/25', Icon: CheckCircle2 },
    CANCELLED:       { label: 'Отменён',            tone: 'text-ink-500',    chip: 'bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-300/50',           Icon: XCircle },
    DISPUTED:        { label: 'Спор',                tone: 'text-danger-700', chip: 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-500/25',   Icon: ShieldAlert },
}

const counterpart = (d: DialogListItem, meId?: string) => {
    const c = meId === d.responderId ? d.lead.creator : d.responder
    return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Пользователь'
}

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')

const dateShort = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function PageShell({ children }: { children: React.ReactNode }) {
    return <div className="p-6 md:p-8 lg:p-10 max-w-6xl mx-auto w-full">{children}</div>
}

export function MyDialogsList() {
    const { dialogs, isLoading, error, disabled, disabledMessage } = useMyDialogs()
    const { user } = useUser()
    const menu = useMobileMenu()
    const tour = useTour()
    const router = useRouter()

    const topbar = (
        <Topbar
            title="Мои диалоги"
            subtitle="Все ваши сделки по обмену учениками."
            onMobileMenuToggle={menu.toggle}
            hideSearch
            actions={
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" leftIcon={<Compass className="w-4 h-4" />} onClick={tour.start}>
                        Тур
                    </Button>
                    <Button variant="ghost" size="sm" leftIcon={<ArrowRight className="w-4 h-4" />} onClick={() => router.push('/dashboard/leads')}>
                        К ленте
                    </Button>
                </div>
            }
        />
    )
    const shell = (children: React.ReactNode) => (
        <>
            {topbar}
            <PageShell>{children}</PageShell>
        </>
    )

    if (disabled) {
        return shell(
            <div className="rounded-2xl border border-warning-500/25 bg-warning-50 p-5 text-sm text-warning-700 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span>{disabledMessage || 'Обмен учениками временно недоступен'}</span>
            </div>
        )
    }

    if (isLoading) {
        return shell(
                <ul className="space-y-3">
                    {[0, 1, 2].map((i) => (
                        <li key={i} className="rounded-2xl border border-ink-200 bg-surface p-5 animate-pulse">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-full bg-ink-100" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-40 bg-ink-100 rounded" />
                                    <div className="h-3 w-24 bg-ink-100 rounded" />
                                </div>
                                <div className="h-6 w-24 bg-ink-100 rounded-lg" />
                            </div>
                        </li>
                    ))}
                </ul>
        )
    }

    if (error) {
        return shell(
            <div className="rounded-2xl border border-danger-500/25 bg-danger-50 p-5 text-sm text-danger-700 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span>{error}</span>
            </div>
        )
    }

    if (!dialogs.length) {
        return shell(
                <div className="rounded-2xl border-2 border-dashed border-ink-200 bg-surface p-12 text-center">
                    <div className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 text-brand-500 items-center justify-center mb-4">
                        <MessageSquare className="w-7 h-7" />
                    </div>
                    <h2 className="font-display text-lg font-bold text-ink-900 mb-1">Пока нет диалогов</h2>
                    <p className="text-sm text-ink-500 mb-6 max-w-md mx-auto leading-relaxed">
                        Диалог появится, когда вы откликнетесь на чужую заявку в ленте — или когда кто-то откликнется на вашу.
                    </p>
                    <Link
                        href="/dashboard/leads"
                        className="inline-flex items-center gap-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-5 py-3 shadow-brand-glow transition-colors duration-fast"
                    >
                        Открыть ленту заявок <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
        )
    }

    return shell(
            <ul data-tour="dialogs-list" className="space-y-3">
                {dialogs.map((d) => {
                    const meta = STATUS[d.status]
                    const StatusIcon = meta.Icon
                    const name = counterpart(d, user?.id)
                    const isMyLead = user?.id === d.lead.creatorId
                    return (
                        <li key={d.id}>
                            <Link
                                href={`/dashboard/dialogs/${d.id}`}
                                className="group block rounded-2xl border border-ink-200 bg-surface p-5 md:p-6 hover:border-brand-300 hover:shadow-sm transition-all duration-fast"
                            >
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-ink-100 text-ink-700 flex items-center justify-center font-semibold text-base md:text-lg shrink-0 shadow-xs">
                                        {initials(name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="font-display font-bold text-ink-900 text-lg md:text-xl truncate">{d.lead.subject}</span>
                                            <span className="text-ink-400 text-sm">·</span>
                                            <span className="text-ink-500 text-sm">{d.lead.grade}</span>
                                        </div>
                                        <div className="text-sm md:text-base text-ink-600 truncate">
                                            {isMyLead ? 'Откликнулся ' : 'С '}<span className="font-semibold text-ink-800">{name}</span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
                                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${meta.chip}`}>
                                            <StatusIcon className="w-4 h-4" />
                                            {meta.label}
                                        </span>
                                        <span className="text-xs text-ink-400 tnum">{dateShort(d.createdAt)}</span>
                                    </div>
                                    <ChevronRight className="w-6 h-6 text-ink-300 group-hover:text-brand-400 shrink-0 transition-colors duration-fast" />
                                </div>
                                <div className="sm:hidden mt-3 flex items-center justify-between">
                                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${meta.chip}`}>
                                        <StatusIcon className="w-3.5 h-3.5" />
                                        {meta.label}
                                    </span>
                                    <span className="text-[11px] text-ink-400 tnum">{dateShort(d.createdAt)}</span>
                                </div>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        )
}
