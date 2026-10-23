'use client'

import { ShieldAlert } from 'lucide-react'

export function SystemMessage({ text }: { text: string }) {
    return (
        <div className="my-2 border border-amber-200 bg-amber-50 text-amber-900 text-xs rounded-lg p-3 flex gap-2 items-start">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="whitespace-pre-wrap">{text}</span>
        </div>
    )
}
