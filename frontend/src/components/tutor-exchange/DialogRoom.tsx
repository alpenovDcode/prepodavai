'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    User,
    XCircle,
    CheckCircle2,
    Lock,
    ExternalLink,
    CircleDot,
    CalendarClock,
    Coins,
    ShieldAlert,
    Video,
    Sparkles,
    Info,
    Compass,
} from 'lucide-react'
import { useUser } from '@/lib/hooks/useUser'
import { useDialog } from '@/hooks/tutor-exchange/useDialog'
import { DialogChat } from './DialogChat'
import { DialogActionsPanel } from './DialogActionsPanel'
import { PaymentCountdown } from './PaymentCountdown'
import { ViolationForm } from './ViolationForm'
import { Topbar } from '@/components/layout/v2/Topbar'
import { Button } from '@/components/ui/v2/Button'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'

type StatusMeta = {
    label: string
    hint: string
    tone: string    // ring/text
    chip: string    // bg + text for pill
    Icon: React.ComponentType<{ className?: string }>
}

const STATUS: Record<string, StatusMeta> = {
    OPEN: {
        label: 'Диалог открыт',
        hint: 'Обсудите ученика и договоритесь о пробном уроке.',
        tone: 'ring-info-500/25 text-info-700',
        chip: 'bg-info-50 text-info-700 ring-1 ring-inset ring-info-500/20',
        Icon: CircleDot,
    },
    TRIAL_PENDING: {
        label: 'Пробный урок',
        hint: 'Ожидается результат пробного урока.',
        tone: 'ring-brand-400/30 text-brand-700',
        chip: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-400/30',
        Icon: CalendarClock,
    },
    PAYMENT_PENDING: {
        label: 'Оплата комиссии',
        hint: 'Репетитор переводит комиссию, автор подтверждает получение.',
        tone: 'ring-warning-500/25 text-warning-700',
        chip: 'bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-500/25',
        Icon: Coins,
    },
    CONFIRMED: {
        label: 'Сделка закрыта',
        hint: 'Контакт ученика открыт. Удачных занятий!',
        tone: 'ring-success-500/25 text-success-700',
        chip: 'bg-success-50 text-success-700 ring-1 ring-inset ring-success-500/25',
        Icon: CheckCircle2,
    },
    CANCELLED: {
        label: 'Отменён',
        hint: 'Диалог был отменён.',
        tone: 'ring-ink-300/50 text-ink-500',
        chip: 'bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-300/50',
        Icon: XCircle,
    },
    DISPUTED: {
        label: 'Открыт спор',
        hint: 'Модератор рассмотрит в течение суток.',
        tone: 'ring-danger-500/25 text-danger-700',
        chip: 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-500/25',
        Icon: ShieldAlert,
    },
}

const ACTIVE_STATUSES = ['OPEN', 'TRIAL_PENDING', 'PAYMENT_PENDING']

const counterpartName = (dialog: any, meId?: string) => {
    const c = meId === dialog.responderId ? dialog.lead.creator : dialog.responder
    return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Пользователь'
}

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('')

export function DialogRoom({ dialogId }: { dialogId: string }) {
    const { user } = useUser()
    const { dialog, isLoading, error, disabled, disabledMessage, reload } = useDialog(dialogId)
    const [reportOpen, setReportOpen] = useState(false)
    const menu = useMobileMenu()
    const tour = useTour()

    const topbar = (
        <Topbar
            title="Диалог сделки"
            onMobileMenuToggle={menu.toggle}
            hideSearch
            leading={
                <Link
                    href="/dashboard/dialogs"
                    aria-label="К диалогам"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-md text-ink-600 hover:bg-ink-100 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
            }
            actions={
                <Button variant="ghost" size="sm" leftIcon={<Compass className="w-4 h-4" />} onClick={tour.start}>
                    Тур
                </Button>
            }
        />
    )
    const chrome = (children: React.ReactNode) => (
        <>
            {topbar}
            <Shell>{children}</Shell>
        </>
    )

    if (disabled) {
        return chrome(
            <div className="rounded-2xl border border-warning-500/25 bg-warning-50 p-5 text-sm text-warning-700 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span>{disabledMessage || 'Обмен учениками временно недоступен'}</span>
            </div>
        )
    }

    if (error) {
        return chrome(
            <div className="rounded-2xl border border-danger-500/25 bg-danger-50 p-5 text-sm text-danger-700 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <span>{error}</span>
            </div>
        )
    }

    if (isLoading || !dialog) {
        return chrome(
            <div className="rounded-2xl border border-ink-200 bg-surface p-8 text-sm text-ink-500 flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем диалог...
            </div>
        )
    }

    const isCreator = user?.id === dialog.lead.creatorId
    const isResponder = user?.id === dialog.responderId
    const isParticipant = isCreator || isResponder
    const canWrite = isParticipant && ACTIVE_STATUSES.includes(dialog.status)
    const status = STATUS[dialog.status] || STATUS.OPEN
    const counterpartId = user?.id === dialog.responderId ? dialog.lead.creatorId : dialog.responderId
    const name = counterpartName(dialog, user?.id)
    // Защита от javascript:/data: в href (backend уже валидирует при записи,
    // но старые записи и любой обход клиента не должны давать XSS по клику).
    const safeTrialLink =
        dialog.trialLessonLink && /^https?:\/\//i.test(dialog.trialLessonLink)
            ? dialog.trialLessonLink
            : null

    return chrome(
        <>
            {/* Header card: subject + counterpart avatar + status */}
            <header className="rounded-2xl border border-ink-200 bg-surface p-5 md:p-6 mb-5 shadow-xs">
                <div className="flex items-start gap-5">
                    <Link
                        href={`/dashboard/tutor/${counterpartId}`}
                        className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-ink-100 text-ink-700 flex items-center justify-center font-semibold text-lg md:text-xl shrink-0 hover:ring-4 hover:ring-brand-500/10 transition-all duration-fast"
                    >
                        {initials(name)}
                    </Link>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <h1 className="font-display text-xl md:text-2xl font-bold text-ink-900 truncate">
                                {dialog.lead.subject}
                            </h1>
                            <span className="text-ink-400 text-base">·</span>
                            <span className="text-ink-500 text-base">{dialog.lead.grade}</span>
                        </div>
                        <div className="text-sm md:text-base text-ink-600">
                            С{' '}
                            <Link
                                href={`/dashboard/tutor/${counterpartId}`}
                                className="inline-flex items-center gap-1 font-semibold text-ink-800 hover:text-brand-700 hover:underline"
                            >
                                <User className="w-4 h-4" /> {name}
                            </Link>
                        </div>
                    </div>
                    <span
                        className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shrink-0 ${status.chip}`}
                    >
                        <status.Icon className="w-4 h-4" />
                        {status.label}
                    </span>
                </div>
                <div className="sm:hidden mt-3">
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${status.chip}`}
                    >
                        <status.Icon className="w-3.5 h-3.5" />
                        {status.label}
                    </span>
                </div>
            </header>

            {/* Main grid: chat + aside */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-5">
                <DialogChat dialog={dialog} meId={user?.id} canWrite={canWrite} onSent={reload} />

                <aside className="space-y-3 md:space-y-4">
                    {/* Status hint card */}
                    <section data-tour="dialog-status" className="rounded-2xl border border-ink-200 bg-surface p-4 shadow-xs">
                        <SectionTitle>Статус сделки</SectionTitle>
                        <div className="flex items-start gap-2.5">
                            <div className={`shrink-0 mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${status.chip}`}>
                                <status.Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="font-semibold text-sm text-ink-900">{status.label}</div>
                                <div className="text-xs text-ink-500 mt-0.5 leading-relaxed">{status.hint}</div>
                            </div>
                        </div>

                        {dialog.status === 'TRIAL_PENDING' && safeTrialLink && (
                            <a
                                href={safeTrialLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-3 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 hover:bg-brand-50 p-3 transition-colors duration-fast group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center shrink-0">
                                    <Video className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                                        Ссылка на пробный
                                    </div>
                                    <div className="text-xs text-ink-700 truncate group-hover:text-brand-800">
                                        {safeTrialLink}
                                    </div>
                                </div>
                                <ExternalLink className="w-4 h-4 text-brand-500 shrink-0" />
                            </a>
                        )}

                        {dialog.status === 'PAYMENT_PENDING' && dialog.paymentDeadline && (
                            <div className="mt-3 rounded-xl border border-warning-500/20 bg-warning-50 p-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-warning-700 mb-1">
                                    До оплаты
                                </div>
                                <PaymentCountdown deadline={dialog.paymentDeadline} />
                                {dialog.paymentSentAt && (
                                    <div className="text-xs text-success-700 mt-1.5 flex items-center gap-1">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Оплата отмечена {new Date(dialog.paymentSentAt).toLocaleString('ru-RU')}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    {/* Contact card */}
                    <section data-tour="dialog-contact" className="rounded-2xl border border-ink-200 bg-surface p-4 shadow-xs">
                        <SectionTitle>Контакт ученика</SectionTitle>
                        {dialog.lead.studentContact ? (
                            <div className="flex items-start gap-2">
                                <div className="w-8 h-8 rounded-lg bg-success-50 text-success-700 flex items-center justify-center shrink-0">
                                    <Sparkles className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-ink-900 break-words">
                                        {dialog.lead.studentContact}
                                    </div>
                                    <div className="text-[11px] text-ink-500 mt-0.5">Контакт открыт после закрытия сделки.</div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2">
                                <div className="w-8 h-8 rounded-lg bg-ink-100 text-ink-500 flex items-center justify-center shrink-0">
                                    <Lock className="w-4 h-4" />
                                </div>
                                <div className="text-xs text-ink-500 leading-relaxed">
                                    Откроется после закрытия сделки — это защита автора заявки от обхода комиссии.
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Actions */}
                    {isParticipant && (
                        <DialogActionsPanel
                            dialog={dialog}
                            meId={user?.id}
                            onDone={reload}
                            onReport={() => setReportOpen(true)}
                        />
                    )}

                    {/* Read-only observer hint */}
                    {!isParticipant && (
                        <section className="rounded-2xl border border-ink-200 bg-ink-50 p-4 text-xs text-ink-500 flex gap-2 items-start">
                            <Info className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>Вы наблюдаете диалог — действия доступны только участникам.</span>
                        </section>
                    )}
                </aside>
            </div>

            {reportOpen && (
                <ViolationForm
                    dialogId={dialog.id}
                    onClose={() => setReportOpen(false)}
                    onDone={() => alert('Жалоба отправлена. Модератор рассмотрит в течение суток.')}
                />
            )}
        </>
    )
}

function Shell({ children }: { children: React.ReactNode }) {
    return <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">{children}</div>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500 mb-3">
            {children}
        </div>
    )
}
