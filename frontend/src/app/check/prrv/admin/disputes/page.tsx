'use client'

import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { useAdminDisputes, AdminDispute } from '@/hooks/tutor-exchange/useAdminDisputes'
import { DisputeResolver, type Resolution } from '@/components/tutor-exchange/DisputeResolver'
import { Loader2, ShieldAlert, Snowflake, Undo2, Coins, Sparkles } from 'lucide-react'

const nameOf = (
    u: { firstName?: string | null; lastName?: string | null } | null | undefined,
    fallback = 'Пользователь',
) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || fallback

export default function AdminDisputesPage() {
    const { items, isLoading, error, reload } = useAdminDisputes()

    const resolve = async (
        dialogId: string,
        resolution: Resolution,
        note: string,
        freezeResponder: boolean,
    ) => {
        await apiClient.post(`/admin/tutor-exchange/dialogs/${dialogId}/resolve`, {
            resolution,
            note,
            freezeResponder,
        })
        reload()
    }

    const unfreeze = async (userId: string) => {
        if (!confirm('Разморозить репетитора? Он снова сможет откликаться и размещать заявки.')) return
        try {
            await apiClient.post(`/admin/tutor-exchange/tutors/${userId}/unfreeze`, {})
            reload()
        } catch (err: any) {
            alert(err?.response?.data?.message || 'Не удалось разморозить')
        }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-1">
                <h1 className="text-xl font-bold text-gray-900 inline-flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-600" /> Споры по обмену учениками
                </h1>
                <Link href="/check/prrv/admin/violations" className="text-sm text-gray-500 hover:text-gray-800">
                    К жалобам
                </Link>
            </div>
            <p className="text-sm text-gray-500 mb-4">
                Диалоги в статусе «спор» — заявка заблокирована, пока модератор не примет решение.
            </p>

            {isLoading && (
                <div className="text-sm text-gray-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Загружаем...
                </div>
            )}
            {error && (
                <div className="border border-red-200 bg-red-50 rounded-xl p-4 text-sm text-red-800">{error}</div>
            )}
            {!isLoading && !error && items.length === 0 && (
                <div className="border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
                    Открытых споров нет 🎉
                </div>
            )}

            <div className="space-y-2">
                {items.map((d) => (
                    <DisputeCard key={d.id} dispute={d} onResolve={resolve} onUnfreeze={unfreeze} />
                ))}
            </div>
        </div>
    )
}

function DisputeCard({
    dispute: d,
    onResolve,
    onUnfreeze,
}: {
    dispute: AdminDispute
    onResolve: (dialogId: string, resolution: Resolution, note: string, freeze: boolean) => Promise<void>
    onUnfreeze: (userId: string) => Promise<void>
}) {
    const isFree = d.lead.type === 'FREE'
    const frozen = !!d.responder.marketProfile?.disabledAt

    return (
        <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{d.lead.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{d.lead.grade}</div>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                    {isFree ? (
                        <span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> FREE</span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> {d.lead.price.toLocaleString('ru-RU')} ₽</span>
                    )}
                </span>
            </div>

            <div className="text-xs text-gray-500 mb-2 flex items-center gap-1.5 flex-wrap">
                <span>Заказчик — {nameOf(d.lead.creator)}, репетитор — {nameOf(d.responder)}</span>
                {frozen && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-md px-1.5 py-0.5">
                        <Snowflake className="w-3 h-3" /> заморожен
                        <button
                            onClick={() => onUnfreeze(d.responder.id)}
                            className="ml-1 inline-flex items-center gap-0.5 text-sky-700 hover:text-sky-900 underline"
                        >
                            <Undo2 className="w-3 h-3" /> разморозить
                        </button>
                    </span>
                )}
            </div>

            {d.reports.length > 0 && (
                <div className="mb-2 space-y-1">
                    {d.reports.map((r) => (
                        <div key={r.id} className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2">
                            <span className="text-gray-400">Жалоба от {nameOf(r.reporter)}:</span> {r.description}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-2">
                <Link href={`/dashboard/dialogs/${d.id}`} className="text-xs text-blue-600 hover:underline">
                    Открыть диалог →
                </Link>
            </div>

            <DisputeResolver
                onResolve={(resolution, note, freeze) => onResolve(d.id, resolution, note, freeze)}
            />
        </div>
    )
}
