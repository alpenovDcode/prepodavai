'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api/client'
import { Loader2 } from 'lucide-react'

interface Props {
    leadId: string
    initial: {
        grade: string
        format: 'ONLINE' | 'OFFLINE'
        city?: string | null
        description: string
        studentContact?: string
        type: 'FREE' | 'COMMISSION'
        price: number
    }
    onClose: () => void
    onSaved: () => void
}

export function EditLeadModal({ leadId, initial, onClose, onSaved }: Props) {
    const [grade, setGrade] = useState(initial.grade)
    const [format, setFormat] = useState<'ONLINE' | 'OFFLINE'>(initial.format)
    const [city, setCity] = useState(initial.city || '')
    const [description, setDescription] = useState(initial.description)
    const [studentContact, setStudentContact] = useState(initial.studentContact || '')
    const [price, setPrice] = useState(String(initial.price || ''))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isCommission = initial.type === 'COMMISSION'
    const canSubmit = grade.trim() && description.trim().length >= 30

    const submit = async () => {
        setSaving(true)
        setError(null)
        try {
            const payload: any = {
                grade: grade.trim(),
                format,
                city: format === 'OFFLINE' ? city.trim() : undefined,
                description: description.trim(),
                studentContact: studentContact.trim() || undefined,
            }
            if (isCommission) {
                const p = Number(price)
                if (!Number.isFinite(p) || p < 100) {
                    setError('Комиссия должна быть от 100 ₽')
                    setSaving(false)
                    return
                }
                payload.price = p
            }
            await apiClient.patch(`/tutor-exchange/leads/${leadId}`, payload)
            onSaved()
            onClose()
        } catch (err: any) {
            const msg = err?.response?.data?.message || 'Не удалось сохранить'
            setError(Array.isArray(msg) ? msg.join('; ') : msg)
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-xl p-6 md:p-8 max-w-xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Редактировать заявку</h2>
                <p className="text-sm text-gray-500 mb-6">Тип и предмет менять нельзя — они влияют на поиск.</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Уровень / класс</label>
                        <input
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Формат</label>
                            <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value as 'ONLINE' | 'OFFLINE')}
                                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="ONLINE">Онлайн</option>
                                <option value="OFFLINE">Оффлайн</option>
                            </select>
                        </div>
                        {format === 'OFFLINE' && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Город</label>
                                <input
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Описание</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={5}
                            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-y"
                        />
                        <p className={`text-xs mt-1.5 font-medium ${description.trim().length < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {description.trim().length} / 30 символов минимум
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Контакт ученика</label>
                        <input
                            value={studentContact}
                            onChange={(e) => setStudentContact(e.target.value)}
                            className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                        <p className="text-xs text-gray-500 mt-1.5">🔒 Виден только вам до подтверждения сделки.</p>
                    </div>
                    {isCommission && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Комиссия, ₽ (от 100)</label>
                            <input
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                type="number"
                                min={100}
                                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                    )}
                    {error && (
                        <div className="text-sm text-red-700 border border-red-200 bg-red-50 rounded-xl px-4 py-3">{error}</div>
                    )}
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end mt-6">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-5 py-3 text-base text-gray-700 hover:bg-gray-100 rounded-xl disabled:opacity-50"
                    >
                        Отмена
                    </button>
                    <button
                        onClick={submit}
                        disabled={!canSubmit || saving}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Сохранить изменения
                    </button>
                </div>
            </div>
        </div>
    )
}
