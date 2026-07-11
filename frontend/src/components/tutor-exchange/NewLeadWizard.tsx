'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { ArrowLeft, Sparkles, Coins, Loader2, CheckCircle2 } from 'lucide-react'

type Step = 'type' | 'form' | 'preview'

interface Form {
    type: 'FREE' | 'COMMISSION'
    subject: string
    grade: string
    format: 'ONLINE' | 'OFFLINE'
    city: string
    description: string
    studentContact: string
    price: string
}

const EMPTY: Form = {
    type: 'COMMISSION',
    subject: '', grade: '', format: 'ONLINE', city: '',
    description: '', studentContact: '', price: '',
}

const STEP_LABEL: Record<Step, string> = {
    type: 'Тип',
    form: 'Данные',
    preview: 'Проверка',
}

function Stepper({ step }: { step: Step }) {
    const steps: Step[] = ['type', 'form', 'preview']
    const idx = steps.indexOf(step)
    return (
        <div className="flex items-center gap-3 mb-8">
            {steps.map((s, i) => {
                const active = i === idx
                const done = i < idx
                return (
                    <div key={s} className="flex items-center gap-3">
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition ${
                                done
                                    ? 'bg-emerald-500 text-white'
                                    : active
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-200 text-gray-500'
                            }`}
                        >
                            {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                        </div>
                        <span className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-500'}`}>
                            {STEP_LABEL[s]}
                        </span>
                        {i < steps.length - 1 && <div className="w-8 h-px bg-gray-200" />}
                    </div>
                )
            })}
        </div>
    )
}

export function NewLeadWizard() {
    const router = useRouter()
    const [step, setStep] = useState<Step>('type')
    const [form, setForm] = useState<Form>(EMPTY)
    const [accepted, setAccepted] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }))

    const isFree = form.type === 'FREE'
    const priceNum = Number(form.price) || 0
    const canPreview =
        form.subject.trim() &&
        form.grade.trim() &&
        form.description.trim().length >= 30 &&
        form.studentContact.trim() &&
        (isFree || priceNum >= 100)

    const submit = async () => {
        setSaving(true)
        setError(null)
        try {
            const resp = await apiClient.post<{ id: string }>('/tutor-exchange/leads', {
                type: form.type,
                subject: form.subject.trim(),
                grade: form.grade.trim(),
                format: form.format,
                city: form.format === 'OFFLINE' ? form.city.trim() : undefined,
                description: form.description.trim(),
                studentContact: form.studentContact.trim(),
                price: isFree ? 0 : priceNum,
            })
            router.push(`/dashboard/leads/${resp.data.id}`)
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось опубликовать заявку'
            setError(Array.isArray(msg) ? msg.join('; ') : msg)
            setSaving(false)
        }
    }

    if (step === 'type') {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                <Stepper step={step} />
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Новая заявка</h1>
                <p className="text-base text-gray-500 mb-8">Выберите тип — как хотите передать ученика.</p>
                <div data-tour="lead-type" className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => { setForm((f) => ({ ...f, type: 'FREE' })); setStep('form') }}
                        className="text-left p-7 border-2 border-gray-200 rounded-2xl hover:border-emerald-400 hover:shadow-md bg-white transition-all"
                    >
                        <div className="inline-flex w-12 h-12 rounded-2xl bg-emerald-50 items-center justify-center mb-4">
                            <Sparkles className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div className="font-bold text-lg text-gray-900 mb-1">Бесплатная передача</div>
                        <p className="text-sm text-gray-500 leading-relaxed">Отдаёте ученика коллеге без комиссии — просто помогаете.</p>
                    </button>
                    <button
                        onClick={() => { setForm((f) => ({ ...f, type: 'COMMISSION' })); setStep('form') }}
                        className="text-left p-7 border-2 border-gray-200 rounded-2xl hover:border-amber-400 hover:shadow-md bg-white transition-all"
                    >
                        <div className="inline-flex w-12 h-12 rounded-2xl bg-amber-50 items-center justify-center mb-4">
                            <Coins className="w-6 h-6 text-amber-500" />
                        </div>
                        <div className="font-bold text-lg text-gray-900 mb-1">С комиссией</div>
                        <p className="text-sm text-gray-500 leading-relaxed">Коллега платит вам разово от 100 ₽ после успешного пробного.</p>
                    </button>
                </div>
            </div>
        )
    }

    if (step === 'form') {
        return (
            <div className="p-6 md:p-8 max-w-3xl mx-auto">
                <button onClick={() => setStep('type')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
                    <ArrowLeft className="w-4 h-4" /> Изменить тип
                </button>
                <Stepper step={step} />
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Заполните заявку</h1>
                <p className="text-base text-gray-500 mb-6">
                    {isFree ? 'Бесплатная передача' : 'С комиссией'} · Все поля обязательные.
                </p>
                <div className="space-y-5 bg-white border border-gray-200 rounded-2xl p-6 md:p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Предмет</label>
                            <input value={form.subject} onChange={(e) => set('subject', e.target.value)}
                                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="Математика" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Уровень / класс</label>
                            <input value={form.grade} onChange={(e) => set('grade', e.target.value)}
                                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="10 класс, ЕГЭ" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Формат</label>
                            <select value={form.format} onChange={(e) => set('format', e.target.value)}
                                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                                <option value="ONLINE">Онлайн</option>
                                <option value="OFFLINE">Оффлайн</option>
                            </select>
                        </div>
                        {form.format === 'OFFLINE' && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Город</label>
                                <input value={form.city} onChange={(e) => set('city', e.target.value)}
                                    className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Москва" />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Описание ученика</label>
                        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5}
                            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y"
                            placeholder="Цели, уровень, особенности, ожидания..." />
                        <p className={`text-xs mt-1.5 font-medium ${form.description.trim().length < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {form.description.trim().length} / 30 символов минимум
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Контакт ученика</label>
                        <input value={form.studentContact} onChange={(e) => set('studentContact', e.target.value)}
                            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            placeholder="+7 (999) 123-45-67 или @username" />
                        <p className="text-xs text-gray-500 mt-1.5">
                            🔒 Скрыт от всех до подтверждения сделки. Откликнувшийся репетитор увидит его после «Подтвердить оплату».
                        </p>
                    </div>
                    {!isFree && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Комиссия, ₽ (от 100)</label>
                            <input value={form.price} onChange={(e) => set('price', e.target.value)} type="number" min={100} max={50000}
                                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                placeholder="1000" />
                        </div>
                    )}
                    <button
                        onClick={() => setStep('preview')}
                        disabled={!canPreview}
                        className="w-full py-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                    >
                        Проверить и опубликовать →
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto">
            <button onClick={() => setStep('form')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6">
                <ArrowLeft className="w-4 h-4" /> Исправить
            </button>
            <Stepper step={step} />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Проверьте заявку</h1>
            <p className="text-base text-gray-500 mb-6">После публикации она сразу появится в общей ленте.</p>
            <div className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 space-y-5">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? '✨ FREE' : `💰 ${priceNum.toLocaleString('ru-RU')} ₽`}
                    </span>
                    <h2 className="text-2xl font-bold text-gray-900">{form.subject}</h2>
                </div>
                <div className="text-base text-gray-600">
                    {form.grade} · {form.format === 'ONLINE' ? 'Онлайн' : `Оффлайн${form.city ? `, ${form.city}` : ''}`}
                </div>
                <p className="text-base text-gray-800 whitespace-pre-wrap leading-relaxed border-l-4 border-gray-100 pl-4">
                    {form.description}
                </p>
                <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-3">
                    🔒 Контакт ученика: <span className="text-gray-400">скрыт до закрытия сделки</span>
                </div>
                <label className="flex items-start gap-3 text-sm text-gray-700 pt-3 border-t border-gray-100 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => setAccepted(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Подтверждаю: информация об ученике достоверна, я готов передать его другому репетитору.</span>
                </label>
                {error && (
                    <div className="text-sm text-red-700 border border-red-200 bg-red-50 rounded-xl px-4 py-3">
                        {error}
                    </div>
                )}
                <button
                    onClick={submit}
                    disabled={!accepted || saving}
                    className="w-full py-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm inline-flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {saving ? 'Публикуем...' : 'Опубликовать заявку'}
                </button>
            </div>
        </div>
    )
}
