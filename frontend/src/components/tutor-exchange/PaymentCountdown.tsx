'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertOctagon } from 'lucide-react'

function formatLeft(ms: number): string {
    if (ms <= 0) return 'Просрочено'
    const s = Math.floor(ms / 1000)
    const d = Math.floor(s / 86400)
    const h = Math.floor((s % 86400) / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (d > 0) return `${d}д ${h}ч`
    if (h > 0) return `${h}ч ${m}м`
    return `${m}м`
}

export function PaymentCountdown({ deadline }: { deadline: string }) {
    const target = new Date(deadline).getTime()
    const [ms, setMs] = useState(() => target - Date.now())

    useEffect(() => {
        const id = setInterval(() => setMs(target - Date.now()), 30_000)
        return () => clearInterval(id)
    }, [target])

    const overdue = ms <= 0
    return (
        <div className={`inline-flex items-center gap-1 text-sm font-semibold ${overdue ? 'text-red-600' : 'text-amber-700'}`}>
            {overdue ? <AlertOctagon className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            {formatLeft(ms)}
        </div>
    )
}
