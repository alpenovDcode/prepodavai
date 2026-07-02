'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'
import { ArrowLeft, Sparkles, Coins, Loader2 } from 'lucide-react'

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
            <div className="p-6 max-w-3xl mx-auto">
                <Link href="/dashboard/leads" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                    <ArrowLeft className="w-4 h-4" /> К ленте
                </Link>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Новая заявка</h1>
                <p className="text-sm text-gray-500 mb-6">Выберите тип — как хотите передать ученика.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => { setForm((f) => ({ ...f, type: 'FREE' })); setStep('form') }}
                        className="text-left p-6 border-2 border-gray-200 rounded-2xl hover:border-emerald-400 bg-white transition"
                    >
                        <Sparkles className="w-8 h-8 text-emerald-500 mb-3" />
                        <div className="font-semibold text-gray-900">Бесплатная передача</div>
                        <p className="text-sm text-gray-500 mt-1">Отдаёте ученика коллеге без комиссии — просто помогаете.</p>
                    </button>
                    <button
                        onClick={() => { setForm((f) => ({ ...f, type: 'COMMISSION' })); setStep('form') }}
                        className="text-left p-6 border-2 border-gray-200 rounded-2xl hover:border-amber-400 bg-white transition"
                    >
                        <Coins className="w-8 h-8 text-amber-500 mb-3" />
                        <div className="font-semibold text-gray-900">С комиссией</div>
                        <p className="text-sm text-gray-500 mt-1">Коллега платит вам разово от 100 ₽ после успешного пробного.</p>
                    </button>
                </div>
            </div>
        )
    }

    if (step === 'form') {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <button onClick={() => setStep('type')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                    <ArrowLeft className="w-4 h-4" /> Тип
                </button>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Заполните заявку</h1>
                <p className="text-sm text-gray-500 mb-6">
                    {isFree ? 'Бесплатная передача' : 'С комиссией'} · Все поля обязательные.
                </p>
                <div className="space-y-4 bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Предмет</label>
                            <input value={form.subject} onChange={(e) => set('subject', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                placeholder="Математика" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Уровень / класс</label>
                            <input value={form.grade} onChange={(e) => set('grade', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                placeholder="10 класс, ЕГЭ" />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Формат</label>
                            <select value={form.format} onChange={(e) => set('format', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400">
                                <option value="ONLINE">Онлайн</option>
                                <option value="OFFLINE">Оффлайн</option>
                            </select>
                        </div>
                        {form.format === 'OFFLINE' && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Город</label>
                                <input value={form.city} onChange={(e) => set('city', e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                    placeholder="Москва" />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Описание ученика (мин. 30 символов)</label>
                        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-y"
                            placeholder="Цели, уровень, особенности, ожидания..." />
                        <p className={`text-xs mt-1 ${form.description.trim().length < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {form.description.trim().length} / 30
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Контакт ученика (скрыт до закрытия сделки)</label>
                        <input value={form.studentContact} onChange={(e) => set('studentContact', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                            placeholder="+7 (999) 123-45-67 или @username" />
                        <p className="text-xs text-gray-400 mt-1">Другие репетиторы увидят его только после подтверждения сделки.</p>
                    </div>
                    {!isFree && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Комиссия, ₽ (от 100)</label>
                            <input value={form.price} onChange={(e) => set('price', e.target.value)} type="number" min={100} max={50000}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                                placeholder="1000" />
                        </div>
                    )}
                    <button
                        onClick={() => setStep('preview')}
                        disabled={!canPreview}
                        className="w-full py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                    >
                        Проверить и опубликовать →
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <button onClick={() => setStep('form')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4">
                <ArrowLeft className="w-4 h-4" /> Исправить
            </button>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Проверьте заявку</h1>
            <p className="text-sm text-gray-500 mb-6">После публикации она сразу появится в общей ленте.</p>
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${isFree ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                        {isFree ? 'FREE' : `${priceNum.toLocaleString('ru-RU')} ₽`}
                    </span>
                    <h2 className="text-lg font-semibold text-gray-900">{form.subject}</h2>
                </div>
                <div className="text-sm text-gray-500">
                    {form.grade} · {form.format === 'ONLINE' ? 'Онлайн' : `Оффлайн${form.city ? `, ${form.city}` : ''}`}
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{form.description}</p>
                <div className="text-xs text-gray-500">
                    Контакт ученика:&nbsp;
                    <span className="text-gray-400">скрыт до закрытия сделки</span>
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-600 pt-2 border-t border-gray-100">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                    <span>Подтверждаю: информация об ученике достоверна, я готов передать его другому репетитору.</span>
                </label>
                {error && (
                    <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                        {error}
                    </div>
                )}
                <button
                    onClick={submit}
                    disabled={!accepted || saving}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {saving ? 'Публикуем...' : 'Опубликовать'}
                </button>
            </div>
        </div>
    )
}
