'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { useUser } from '@/lib/hooks/useUser'
import { ArrowLeft, Globe, MapPin, User, Lock, CheckCircle2, Trash2, Loader2, AlertCircle } from 'lucide-react'
import type { LeadCardData } from './LeadCard'

interface LeadDetailsData extends LeadCardData {
    studentContact?: string
    updatedAt: string
}

const formatName = (c: LeadDetailsData['creator']) =>
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Репетитор'

export function LeadDetails({ leadId }: { leadId: string }) {
    const router = useRouter()
    const { user: me } = useUser()
    const [lead, setLead] = useState<LeadDetailsData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => {
        let cancelled = false
        apiClient
            .get<LeadDetailsData>(`/tutor-exchange/leads/${leadId}`)
            .then((r) => { if (!cancelled) setLead(r.data) })
            .catch((err) => {
                if (cancelled) return
                if (err?.response?.status === 404) setError('Заявка не найдена или была снята')
                else if (err?.response?.status === 503 && err.response.data?.tutorExchangeDisabled) setError(err.response.data.message || 'Биржа временно недоступна')
                else setError(err?.response?.data?.message || 'Не удалось загрузить заявку')
            })
        return () => { cancelled = true }
    }, [leadId])

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

    if (error) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-800 flex gap-2 items-start">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                </div>
            </div>
        )
    }
    if (!lead) {
        return (
            <div className="p-6 max-w-2xl mx-auto text-sm text-gray-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Загружаем заявку...
            </div>
        )
    }

    const isFree = lead.type === 'FREE'
    const isCreator = me?.id === lead.creatorId
    const canRespond = !isCreator && lead.status === 'ACTIVE'
    const contactVisible = typeof lead.studentContact === 'string' && lead.studentContact.length > 0

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                <ArrowLeft className="w-4 h-4" /> К ленте
            </Link>

            <div className="bg-white border border-gray-200 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{lead.subject}</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{lead.grade}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? 'FREE' : `${lead.price.toLocaleString('ru-RU')} ₽`}
                    </span>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-5">
                    {lead.format === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1"><Globe className="w-4 h-4" /> Онлайн</span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" /> {lead.city || 'Оффлайн'}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><User className="w-4 h-4" /> {formatName(lead.creator)}</span>
                </div>

                <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap mb-6">
                    {lead.description}
                </div>

                <div className={`rounded-xl border p-4 mb-6 ${contactVisible ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">
                        {contactVisible ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Lock className="w-4 h-4 text-gray-500" />}
                        Контакт ученика
                    </div>
                    {contactVisible ? (
                        <div className="text-sm font-semibold text-emerald-900">{lead.studentContact}</div>
                    ) : (
                        <div className="text-sm text-gray-500">
                            Скрыт — станет виден откликнувшемуся после закрытия сделки.
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {canRespond && (
                        <button
                            disabled
                            title="Откликаться можно с этапа 3 (диалоги)"
                            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-50 cursor-not-allowed"
                        >
                            Откликнуться (скоро)
                        </button>
                    )}
                    {isCreator && lead.status === 'ACTIVE' && (
                        <button
                            onClick={remove}
                            disabled={deleting}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" /> {deleting ? 'Снимаем...' : 'Снять с публикации'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
