'use client'

import Link from 'next/link'
import { MapPin, Globe, User, Sparkles, Coins, Star } from 'lucide-react'

export interface LeadCardData {
    id: string
    creatorId: string
    subject: string
    grade: string
    format: 'ONLINE' | 'OFFLINE'
    city?: string | null
    description: string
    type: 'FREE' | 'COMMISSION'
    price: number
    status: string
    createdAt: string
    creator: {
        id: string
        firstName?: string | null
        lastName?: string | null
        subject?: string | null
    }
}

const formatName = (c: LeadCardData['creator']) =>
    [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || 'Репетитор'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    ACTIVE: { label: 'Активна', cls: 'text-blue-700 bg-blue-50 border-blue-200' },
    LOCKED: { label: 'В работе', cls: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    CLOSED: { label: 'Закрыта', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    CANCELLED: { label: 'Снята', cls: 'text-gray-500 bg-gray-100 border-gray-200' },
}

export function LeadCard({ lead, meId, showStatus = false }: { lead: LeadCardData; meId?: string; showStatus?: boolean }) {
    const isFree = lead.type === 'FREE'
    const isMine = meId && meId === lead.creatorId
    const statusBadge = showStatus ? STATUS_BADGE[lead.status] : undefined

    return (
        <Link href={`/dashboard/leads/${lead.id}`} className="block">
            <article className="border border-gray-200 rounded-2xl p-6 bg-white hover:border-blue-300 hover:shadow-md transition-all h-full flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            {isMine && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-blue-600 text-white">
                                    <Star className="w-3 h-3" /> Ваша
                                </span>
                            )}
                            {statusBadge && (
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${statusBadge.cls}`}>
                                    {statusBadge.label}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 break-words leading-snug">{lead.subject}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{lead.grade}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-lg border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? (
                            <span className="inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> FREE</span>
                        ) : (
                            <span className="inline-flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> {lead.price.toLocaleString('ru-RU')} ₽</span>
                        )}
                    </span>
                </div>

                <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed mb-4 flex-1">
                    {lead.description}
                </p>

                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                    {lead.format === 'ONLINE' ? (
                        <span className="inline-flex items-center gap-1"><Globe className="w-3.5 h-3.5" /> Онлайн</span>
                    ) : (
                        <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {lead.city || 'Оффлайн'}</span>
                    )}
                    <Link
                        href={`/dashboard/tutor/${lead.creator.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 hover:text-gray-800 hover:underline"
                    >
                        <User className="w-3.5 h-3.5" /> {formatName(lead.creator)}
                    </Link>
                    <span className="ml-auto">{new Date(lead.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>
            </article>
        </Link>
    )
}
