'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '@/lib/api/client'
import { Plus, Trash2, Pencil, Eye, EyeOff, Save, X } from 'lucide-react'

interface Popup {
    id: string
    title: string | null
    body: string
    ctaText: string | null
    ctaUrl: string | null
    delaySeconds: number
    isActive: boolean
    priority: number
    startsAt: string | null
    endsAt: string | null
    createdAt: string
    updatedAt: string
}

// Шаблон по умолчанию — подставляется при создании нового popup'а.
const TEMPLATE_TITLE = 'Коллеги, на минуту 🙏'
const TEMPLATE_BODY = `Преподавай сейчас в той фазе, когда каждое решение — что добавить, что переделать, что выкинуть — напрямую влияет на ваш день в работе с учениками. Хочется не угадывать, а делать под ваши задачи.

Помогите нам с обратной связью — 2–3 минуты, 18 коротких вопросов. От «что зашло» до «чего не хватает».

🔗 https://docs.google.com/forms/d/e/1FAIpQLSci4CeTvLs8sv2svkpHEDPQhKQ8ki1NZhZeQ1jZgfTpe-mVFA/viewform

Что важно знать:
• Ответы видим только мы, никому не передаём
• Не нужно регистрироваться или входить в аккаунт
• В конце можно оставить Telegram — спишемся персонально, если по теме вашего ответа есть что обсудить. За такие созвоны иногда даём ранний доступ к новым функциям 💜

Каждый отклик реально читаем — и без этого продукт не получится сделать таким, чтобы он действительно облегчал жизнь репетитору. Спасибо!

P.S. за заполнение начислим +500 токенов`

const emptyDraft = (): Partial<Popup> => ({
    title: TEMPLATE_TITLE,
    body: TEMPLATE_BODY,
    ctaText: 'Пройти опрос',
    ctaUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSci4CeTvLs8sv2svkpHEDPQhKQ8ki1NZhZeQ1jZgfTpe-mVFA/viewform',
    delaySeconds: 5,
    isActive: true,
    priority: 0,
    startsAt: null,
    endsAt: null,
})

export default function AdminPopupsPage() {
    const [popups, setPopups] = useState<Popup[]>([])
    const [loading, setLoading] = useState(true)
    const [editing, setEditing] = useState<Partial<Popup> | null>(null)
    const [saving, setSaving] = useState(false)

    const load = async () => {
        setLoading(true)
        try {
            const resp = await apiClient.get<Popup[]>('/admin/popups')
            setPopups(resp.data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [])

    const save = async () => {
        if (!editing) return
        if (!editing.body || !editing.body.trim()) {
            alert('Заполните текст popup-а.')
            return
        }
        setSaving(true)
        try {
            const payload: any = {
                title: editing.title || undefined,
                body: editing.body,
                ctaText: editing.ctaText || undefined,
                ctaUrl: editing.ctaUrl || undefined,
                delaySeconds: editing.delaySeconds ?? 5,
                isActive: editing.isActive ?? true,
                priority: editing.priority ?? 0,
                startsAt: editing.startsAt || undefined,
                endsAt: editing.endsAt || undefined,
            }
            if (editing.id) {
                await apiClient.patch(`/admin/popups/${editing.id}`, payload)
            } else {
                await apiClient.post('/admin/popups', payload)
            }
            setEditing(null)
            await load()
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || 'Не удалось сохранить'
            alert(Array.isArray(msg) ? msg.join('; ') : msg)
        } finally {
            setSaving(false)
        }
    }

    const remove = async (id: string) => {
        if (!confirm('Удалить popup? Это действие нельзя отменить.')) return
        try {
            await apiClient.delete(`/admin/popups/${id}`)
            await load()
        } catch (e: any) {
            alert(e?.response?.data?.message || 'Не удалось удалить')
        }
    }

    const toggleActive = async (p: Popup) => {
        try {
            await apiClient.patch(`/admin/popups/${p.id}`, { isActive: !p.isActive })
            await load()
        } catch (e) { console.error(e) }
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Popup-окна на главной</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Активный popup с наибольшим приоритетом показывается пользователю через N секунд после загрузки /dashboard.
                    </p>
                </div>
                <button
                    onClick={() => setEditing(emptyDraft())}
                    className="px-4 py-2 bg-[#FF7E58] hover:bg-[#FF6B40] text-white rounded-lg font-semibold text-sm flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Создать
                </button>
            </div>

            {loading ? (
                <p className="text-gray-500">Загрузка...</p>
            ) : popups.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                    Popup-окон пока нет. Нажмите «Создать», чтобы добавить — шаблон с опросом подставится автоматически.
                </div>
            ) : (
                <div className="space-y-3">
                    {popups.map((p) => (
                        <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 text-[11px] rounded font-semibold ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {p.isActive ? 'Активен' : 'Выключен'}
                                    </span>
                                    <span className="text-[11px] text-gray-400">приоритет {p.priority}</span>
                                    <span className="text-[11px] text-gray-400">показ через {p.delaySeconds}с</span>
                                </div>
                                <div className="font-semibold text-gray-900 truncate">{p.title || '(без заголовка)'}</div>
                                <div className="text-xs text-gray-500 line-clamp-2 mt-1 whitespace-pre-wrap">{p.body.slice(0, 200)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => toggleActive(p)}
                                    title={p.isActive ? 'Выключить' : 'Включить'}
                                    className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                                >
                                    {p.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => setEditing(p)}
                                    title="Редактировать"
                                    className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
                                >
                                    <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => remove(p.id)}
                                    title="Удалить"
                                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {editing && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                    onClick={() => setEditing(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">
                                {editing.id ? 'Редактировать popup' : 'Новый popup'}
                            </h3>
                            <button onClick={() => setEditing(null)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Заголовок</label>
                                <input
                                    type="text"
                                    value={editing.title || ''}
                                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                    maxLength={200}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Текст (поддерживаются переносы строк и ссылки https://)
                                </label>
                                <textarea
                                    value={editing.body || ''}
                                    onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                                    rows={14}
                                    maxLength={20000}
                                    className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58] resize-y"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Подпись CTA-кнопки</label>
                                    <input
                                        type="text"
                                        value={editing.ctaText || ''}
                                        onChange={(e) => setEditing({ ...editing, ctaText: e.target.value })}
                                        maxLength={60}
                                        placeholder="Пройти опрос"
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">URL для CTA</label>
                                    <input
                                        type="url"
                                        value={editing.ctaUrl || ''}
                                        onChange={(e) => setEditing({ ...editing, ctaUrl: e.target.value })}
                                        maxLength={2000}
                                        placeholder="https://..."
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Задержка, сек</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={120}
                                        value={editing.delaySeconds ?? 5}
                                        onChange={(e) => setEditing({ ...editing, delaySeconds: Number(e.target.value) })}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Приоритет</label>
                                    <input
                                        type="number"
                                        min={-100}
                                        max={100}
                                        value={editing.priority ?? 0}
                                        onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={editing.isActive ?? true}
                                            onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                                            className="w-4 h-4 accent-[#FF7E58]"
                                        />
                                        Активен
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Начало показа (не обяз.)</label>
                                    <input
                                        type="datetime-local"
                                        value={editing.startsAt ? editing.startsAt.slice(0, 16) : ''}
                                        onChange={(e) => setEditing({ ...editing, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Конец показа (не обяз.)</label>
                                    <input
                                        type="datetime-local"
                                        value={editing.endsAt ? editing.endsAt.slice(0, 16) : ''}
                                        onChange={(e) => setEditing({ ...editing, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF7E58]"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() => setEditing(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={save}
                                disabled={saving}
                                className="px-5 py-2 text-sm font-semibold text-white bg-[#FF7E58] hover:bg-[#FF6B40] rounded-lg disabled:opacity-50 flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Сохранение...' : 'Сохранить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
