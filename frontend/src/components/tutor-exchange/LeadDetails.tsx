'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { useUser } from '@/lib/hooks/useUser'
import {
    ArrowLeft,
    Globe,
    MapPin,
    User,
    Lock,
    CheckCircle2,
    Trash2,
    Loader2,
    AlertCircle,
    Pencil,
    MessagesSquare,
    Sparkles,
    Coins,
    Compass,
} from 'lucide-react'
import type { LeadCardData } from './LeadCard'
import { EditLeadModal } from './EditLeadModal'
import { Topbar } from '@/components/layout/v2/Topbar'
import { Button } from '@/components/ui/v2/Button'
import { useMobileMenu } from '@/components/layout/v2/DashboardLayoutV2'
import { useTour } from '@/lib/tour/useTour'

interface LeadDetailsData extends LeadCardData {
    studentContact?: string
    updatedAt: string
}

const formatName = (c: LeadDetailsData['creator']) =>
    [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || 'Репетитор'

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: 'Активна · видна в ленте', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
    LOCKED: { label: 'В работе · есть отклик', cls: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    CLOSED: { label: 'Сделка закрыта', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    CANCELLED: { label: 'Снята', cls: 'text-gray-500 bg-gray-100 border-gray-200' },
}

export function LeadDetails({ leadId }: { leadId: string }) {
    const router = useRouter()
    const { user: me } = useUser()
    const [lead, setLead] = useState<LeadDetailsData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [responding, setResponding] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const menu = useMobileMenu()
    const tour = useTour()

    const load = useCallback(() => {
        apiClient
            .get<LeadDetailsData>(`/tutor-exchange/leads/${leadId}`)
            .then((r) => setLead(r.data))
            .catch((err) => {
                if (err?.response?.status === 404) setError('Заявка не найдена или была снята')
                else if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) setError(err.response.data.message || 'Обмен учениками временно недоступен')
                else setError(err?.response?.data?.message || 'Не удалось загрузить заявку')
            })
    }, [leadId])

    useEffect(() => {
        setError(null)
        setLead(null)
        load()
    }, [load])

    const respond = async () => {
        setResponding(true)
        try {
            const res = await apiClient.post<{ id: string }>('/tutor-exchange/dialogs', { leadId })
            router.push(`/dashboard/dialogs/${res.data.id}`)
        } catch (err: any) {
            const code = err?.response?.data?.code
            const msg =
                code === 'LimitReached'
                    ? 'У вас уже 5 активных диалогов — закройте или отмените один из них.'
                    : code === 'OverduePayment'
                        ? 'Есть просроченная комиссия по другому диалогу — сначала закройте её.'
                        : code === 'LeadNotAvailable'
                            ? 'Заявка уже занята другим репетитором.'
                            : code === 'OwnLead'
                                ? 'Это ваша собственная заявка.'
                                : err?.response?.data?.message || 'Не удалось откликнуться'
            alert(msg)
            setResponding(false)
        }
    }

    const remove = async () => {
        if (!confirm('Снять заявку с публикации? Это действие необратимо.')) return
        setDeleting(true)
        try {
            await apiClient.delete(`/tutor-exchange/leads/${leadId}`)
            router.push('/dashboard/leads')
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось снять заявку')
            setDeleting(false)
        }
    }

    const chrome = (children: React.ReactNode) => (
        <>
            <Topbar
                title={lead?.subject || 'Заявка'}
                onMobileMenuToggle={menu.toggle}
                hideSearch
                leading={
                    <Link
                        href="/dashboard/leads"
                        aria-label="К ленте"
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
            <div className="p-6 md:p-8 max-w-3xl mx-auto">{children}</div>
        </>
    )

    if (error) {
        return chrome(
            <div className="border border-amber-200 bg-amber-50 rounded-2xl p-5 text-base text-amber-800 flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" /> {error}
            </div>
        )
    }
    if (!lead) {
        return chrome(
            <div className="text-base text-gray-500 flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Загружаем заявку...
            </div>
        )
    }

    const isFree = lead.type === 'FREE'
    const isCreator = me?.id === lead.creatorId
    const canRespond = !isCreator && lead.status === 'ACTIVE'
    const contactVisible = typeof lead.studentContact === 'string' && lead.studentContact.length > 0
    const statusInfo = STATUS_INFO[lead.status]

    return chrome(
        <>
            <div className="flex items-center justify-between mb-6">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                {isCreator && (
                    <Link
                        href="/dashboard/leads?tab=mine"
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
                    >
                        Мои заявки →
                    </Link>
                )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                    {isCreator && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide px-2.5 py-1 rounded-lg bg-blue-600 text-white">
                            Ваша заявка
                        </span>
                    )}
                    {statusInfo && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${statusInfo.cls}`}>
                            {statusInfo.label}
                        </span>
                    )}
                </div>

                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-3xl font-bold text-gray-900 break-words leading-tight">{lead.subject}</h1>
                        <p className="text-base text-gray-500 mt-1">{lead.grade}</p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? (
                            <span className="inline-flex items-center gap-1"><Sparkles className="w-4 h-4" /> FREE</span>
                        ) : (
                            <span className="inline-flex items-center gap-1"><Coins className="w-4 h-4" /> {lead.price.toLocaleString('ru-RU')} ₽</span>
                        )}
                    </span>
                </div>

                <div className="flex items-center gap-5 text-sm text-gray-600 mb-6 flex-wrap">
                    {lead.format === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1.5"><Globe className="w-4 h-4" /> Онлайн</span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4" /> {lead.city || 'Оффлайн'}</span>
                    )}
                    {lead.creator?.id ? (
                        <Link
                            href={`/dashboard/tutor/${lead.creator.id}`}
                            className="inline-flex items-center gap-1.5 hover:text-gray-900 hover:underline"
                        >
                            <User className="w-4 h-4" /> {formatName(lead.creator)}
                        </Link>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 text-gray-400">
                            <User className="w-4 h-4" /> {formatName(lead.creator)}
                        </span>
                    )}
                </div>

                <div className="prose prose-base max-w-none text-gray-800 whitespace-pre-wrap mb-6 leading-relaxed border-l-4 border-gray-100 pl-4">
                    {lead.description}
                </div>

                <div data-tour="lead-contact" className={`rounded-2xl border p-5 mb-6 ${contactVisible ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5">
                        {contactVisible ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-gray-500" />}
                        Контакт ученика
                    </div>
                    {contactVisible ? (
                        <div className="text-lg font-bold text-emerald-900">{lead.studentContact}</div>
                    ) : (
                        <div className="text-sm text-gray-600">
                            Скрыт — станет виден откликнувшемуся после закрытия сделки.
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-3">
                    {canRespond && (
                        <button
                            onClick={respond}
                            disabled={responding}
                            data-tour="lead-respond"
                            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 shadow-sm"
                        >
                            <MessagesSquare className="w-5 h-5" />
                            {responding ? 'Откликаемся...' : 'Откликнуться'}
                        </button>
                    )}
                    {isCreator && lead.status === 'ACTIVE' && (
                        <>
                            <button
                                onClick={() => setEditOpen(true)}
                                className="inline-flex items-center gap-2 px-5 py-3 text-base text-gray-700 border border-gray-200 hover:bg-gray-50 rounded-xl"
                            >
                                <Pencil className="w-4 h-4" /> Редактировать
                            </button>
                            <button
                                onClick={remove}
                                disabled={deleting}
                                className="inline-flex items-center gap-2 px-5 py-3 text-base text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl disabled:opacity-50 ml-auto"
                            >
                                <Trash2 className="w-4 h-4" /> {deleting ? 'Снимаем...' : 'Снять с публикации'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {editOpen && (
                <EditLeadModal
                    leadId={lead.id}
                    initial={{
                        grade: lead.grade,
                        format: lead.format,
                        city: lead.city,
                        description: lead.description,
                        studentContact: lead.studentContact,
                        type: lead.type,
                        price: lead.price,
                    }}
                    onClose={() => setEditOpen(false)}
                    onSaved={load}
                />
            )}
        </>
    )
}
