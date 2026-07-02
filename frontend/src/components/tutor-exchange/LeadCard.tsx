'use client'

import Link from 'next/link'
import { MapPin, Globe, User, Sparkles, Coins } from 'lucide-react'

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

export function LeadCard({ lead }: { lead: LeadCardData }) {
    const isFree = lead.type === 'FREE'
    return (
        <Link href={`/dashboard/leads/${lead.id}`} className="block">
            <article className="border border-gray-200 rounded-2xl p-5 bg-white hover:border-blue-300 hover:shadow-sm transition">
                <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900">{lead.subject}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{lead.grade}</p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-md border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? (
                            <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> FREE</span>
                        ) : (
                            <span className="inline-flex items-center gap-1"><Coins className="w-3 h-3" /> {lead.price.toLocaleString('ru-RU')} ₽</span>
                        )}
                    </span>
                </div>

                <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed mb-3">
                    {lead.description}
                </p>

                <div className="flex items-center gap-3 text-xs text-gray-500">
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
