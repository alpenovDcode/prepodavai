'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Plus, X, Save, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/v2/Button'
import { cn } from '@/lib/utils/cn'

// ── Типы (зеркало backend PresentationData) ──────────────────────────────────

export type PresentationLayout =
    | 'title' | 'bullets' | 'two-column' | 'quote'
    | 'summary' | 'content' | 'image-text'

export interface PresentationSlide {
    layout: PresentationLayout
    title?: string
    subtitle?: string
    eyebrow?: string
    items?: string[]
    leftTitle?: string
    leftText?: string
    rightTitle?: string
    rightText?: string
    text?: string
    author?: string
    paragraphs?: string[]
    meta?: string
    imageUrl?: string
    imageAlt?: string
}

export interface PresentationData {
    topic: string
    audience: string
    style: string
    color: string
    slides: PresentationSlide[]
}

const LAYOUT_LABELS: Record<PresentationLayout, string> = {
    'title': 'Титульный',
    'bullets': 'Список',
    'two-column': 'Две колонки',
    'quote': 'Цитата',
    'summary': 'Итоги',
    'content': 'Текст',
    'image-text': 'Список + картинка',
}

// ── Универсальные инпуты ─────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-700 mb-1.5">
            {children}
        </label>
    )
}

function TextInput({
    value, onChange, placeholder, multiline,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
    multiline?: boolean
}) {
    if (multiline) {
        return (
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="w-full p-3 rounded-md border border-ink-200 text-[14px] bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all resize-y min-h-[80px]"
            />
        )
    }
    return (
        <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-10 px-3 rounded-md border border-ink-200 text-[14px] bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all"
        />
    )
}

function ListEditor({
    items, onChange, placeholder,
}: {
    items: string[]
    onChange: (v: string[]) => void
    placeholder?: string
}) {
    return (
        <div className="flex flex-col gap-2">
            {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-start">
                    <span className="text-ink-400 text-[14px] font-semibold pt-2.5 min-w-[20px]">
                        {i + 1}.
                    </span>
                    <textarea
                        value={it}
                        onChange={e => {
                            const next = [...items]
                            next[i] = e.target.value
                            onChange(next)
                        }}
                        placeholder={placeholder}
                        rows={1}
                        className="flex-1 px-3 py-2 rounded-md border border-ink-200 text-[14px] bg-surface focus:outline-none focus:border-brand-400 focus:ring-[3px] focus:ring-brand-400/15 transition-all resize-y min-h-[38px]"
                    />
                    <button
                        type="button"
                        onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                        className="w-9 h-9 rounded-md text-ink-400 hover:text-danger-600 hover:bg-danger-50 transition-colors inline-flex items-center justify-center flex-shrink-0"
                        title="Удалить пункт"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
            <button
                type="button"
                onClick={() => onChange([...items, ''])}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[12px] font-semibold text-brand-700 hover:bg-brand-50 rounded-md transition-colors self-start"
            >
                <Plus className="w-3.5 h-3.5" />
                Добавить пункт
            </button>
        </div>
    )
}

// ── Редактор одного слайда ───────────────────────────────────────────────────

function SlideEditor({
    slide, onChange,
}: {
    slide: PresentationSlide
    onChange: (s: PresentationSlide) => void
}) {
    const set = <K extends keyof PresentationSlide>(key: K, value: PresentationSlide[K]) =>
        onChange({ ...slide, [key]: value })

    switch (slide.layout) {
        case 'title':
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Eyebrow (надзаголовок)</FieldLabel>
                        <TextInput value={slide.eyebrow || ''} onChange={v => set('eyebrow', v)} placeholder="ГЛАВА 1" />
                    </div>
                    <div>
                        <FieldLabel>Заголовок</FieldLabel>
                        <TextInput value={slide.title || ''} onChange={v => set('title', v)} placeholder="Название презентации" />
                    </div>
                    <div>
                        <FieldLabel>Подзаголовок</FieldLabel>
                        <TextInput value={slide.subtitle || ''} onChange={v => set('subtitle', v)} multiline />
                    </div>
                    <div>
                        <FieldLabel>Meta (внизу)</FieldLabel>
                        <TextInput value={slide.meta || ''} onChange={v => set('meta', v)} placeholder="Дата · Автор" />
                    </div>
                </div>
            )
        case 'bullets':
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Заголовок</FieldLabel>
                        <TextInput value={slide.title || ''} onChange={v => set('title', v)} />
                    </div>
                    <div>
                        <FieldLabel>Пункты</FieldLabel>
                        <ListEditor items={slide.items || []} onChange={v => set('items', v)} placeholder="Пункт списка" />
                    </div>
                </div>
            )
        case 'two-column':
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Заголовок</FieldLabel>
                        <TextInput value={slide.title || ''} onChange={v => set('title', v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <FieldLabel>Левая колонка — заголовок</FieldLabel>
                            <TextInput value={slide.leftTitle || ''} onChange={v => set('leftTitle', v)} />
                            <div className="h-2" />
                            <FieldLabel>Левая колонка — текст</FieldLabel>
                            <TextInput value={slide.leftText || ''} onChange={v => set('leftText', v)} multiline />
                        </div>
                        <div>
                            <FieldLabel>Правая колонка — заголовок</FieldLabel>
                            <TextInput value={slide.rightTitle || ''} onChange={v => set('rightTitle', v)} />
                            <div className="h-2" />
                            <FieldLabel>Правая колонка — текст</FieldLabel>
                            <TextInput value={slide.rightText || ''} onChange={v => set('rightText', v)} multiline />
                        </div>
                    </div>
                </div>
            )
        case 'quote':
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Текст цитаты</FieldLabel>
                        <TextInput value={slide.text || ''} onChange={v => set('text', v)} multiline />
                    </div>
                    <div>
                        <FieldLabel>Автор</FieldLabel>
                        <TextInput value={slide.author || ''} onChange={v => set('author', v)} placeholder="— Автор" />
                    </div>
                </div>
            )
        case 'summary':
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Заголовок</FieldLabel>
                        <TextInput value={slide.title || ''} onChange={v => set('title', v)} />
                    </div>
                    <div>
                        <FieldLabel>Тезисы</FieldLabel>
                        <ListEditor items={slide.items || []} onChange={v => set('items', v)} placeholder="Ключевая мысль" />
                    </div>
                </div>
            )
        case 'image-text':
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Заголовок</FieldLabel>
                        <TextInput value={slide.title || ''} onChange={v => set('title', v)} />
                    </div>
                    <div>
                        <FieldLabel>Пункты (слева)</FieldLabel>
                        <ListEditor items={slide.items || []} onChange={v => set('items', v)} />
                    </div>
                    <div>
                        <FieldLabel>URL картинки (справа)</FieldLabel>
                        <TextInput value={slide.imageUrl || ''} onChange={v => set('imageUrl', v)} placeholder="https://..." />
                    </div>
                    <div>
                        <FieldLabel>Alt текст (для доступности)</FieldLabel>
                        <TextInput value={slide.imageAlt || ''} onChange={v => set('imageAlt', v)} />
                    </div>
                </div>
            )
        case 'content':
        default:
            return (
                <div className="flex flex-col gap-3">
                    <div>
                        <FieldLabel>Заголовок</FieldLabel>
                        <TextInput value={slide.title || ''} onChange={v => set('title', v)} />
                    </div>
                    <div>
                        <FieldLabel>Параграфы</FieldLabel>
                        <ListEditor items={slide.paragraphs || []} onChange={v => set('paragraphs', v)} placeholder="Параграф текста" />
                    </div>
                </div>
            )
    }
}

// ── Главный компонент: редактор всей презентации ─────────────────────────────

export default function PresentationSlideEditorComponent({
    initialData, onSave, onCancel, saving,
}: {
    initialData: PresentationData
    onSave: (data: PresentationData) => void | Promise<void>
    onCancel: () => void
    saving?: boolean
}) {
    const [data, setData] = useState<PresentationData>(initialData)
    const [activeIdx, setActiveIdx] = useState(0)

    const updateSlide = (idx: number, next: PresentationSlide) => {
        const slides = [...data.slides]
        slides[idx] = next
        setData({ ...data, slides })
    }

    const moveSlide = (idx: number, dir: -1 | 1) => {
        const nextIdx = idx + dir
        if (nextIdx < 0 || nextIdx >= data.slides.length) return
        const slides = [...data.slides]
        ;[slides[idx], slides[nextIdx]] = [slides[nextIdx], slides[idx]]
        setData({ ...data, slides })
        setActiveIdx(nextIdx)
    }

    const deleteSlide = (idx: number) => {
        if (data.slides.length <= 1) return
        if (!confirm('Удалить слайд?')) return
        const slides = data.slides.filter((_, i) => i !== idx)
        setData({ ...data, slides })
        setActiveIdx(Math.min(activeIdx, slides.length - 1))
    }

    const addSlide = (after: number, layout: PresentationLayout) => {
        const blank: PresentationSlide = { layout }
        switch (layout) {
            case 'bullets':
            case 'summary':
            case 'image-text':
                blank.items = ['']; break
            case 'content':
                blank.paragraphs = ['']; break
        }
        const slides = [...data.slides]
        slides.splice(after + 1, 0, blank)
        setData({ ...data, slides })
        setActiveIdx(after + 1)
    }

    const slide = data.slides[activeIdx]
    const dirty = JSON.stringify(data) !== JSON.stringify(initialData)

    return (
        <div className="flex h-full min-h-0">
            {/* Sidebar: список слайдов */}
            <aside className="w-[220px] border-r border-ink-200 bg-ink-50/40 flex flex-col flex-shrink-0">
                <div className="p-3 border-b border-ink-200 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                        Слайды ({data.slides.length})
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                    {data.slides.map((s, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setActiveIdx(i)}
                            className={cn(
                                'text-left p-2.5 rounded-md transition-colors border',
                                i === activeIdx
                                    ? 'bg-brand-50 border-brand-200 text-brand-900'
                                    : 'bg-surface border-transparent hover:bg-ink-100 text-ink-700',
                            )}
                        >
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                                    {i + 1} · {LAYOUT_LABELS[s.layout]}
                                </span>
                            </div>
                            <div className="text-[12px] font-semibold truncate">
                                {s.title || s.text || s.eyebrow || '(без заголовка)'}
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* Center: редактор слайда */}
            <main className="flex-1 min-w-0 flex flex-col">
                {/* Toolbar */}
                <div className="px-4 py-2 border-b border-ink-200 bg-surface flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-ink-600">
                        Слайд {activeIdx + 1} / {data.slides.length}
                    </span>
                    <select
                        value={slide.layout}
                        onChange={e => updateSlide(activeIdx, { ...slide, layout: e.target.value as PresentationLayout })}
                        className="h-8 px-2 text-[12px] font-semibold rounded-md border border-ink-200 bg-surface text-ink-700 cursor-pointer focus:outline-none focus:border-brand-400"
                    >
                        {Object.entries(LAYOUT_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                        ))}
                    </select>

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={() => moveSlide(activeIdx, -1)}
                        disabled={activeIdx === 0}
                        title="Выше"
                        className="w-8 h-8 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors inline-flex items-center justify-center"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => moveSlide(activeIdx, 1)}
                        disabled={activeIdx === data.slides.length - 1}
                        title="Ниже"
                        className="w-8 h-8 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent transition-colors inline-flex items-center justify-center"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={() => deleteSlide(activeIdx)}
                        disabled={data.slides.length <= 1}
                        title="Удалить слайд"
                        className="w-8 h-8 rounded-md text-ink-500 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors inline-flex items-center justify-center"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-ink-200 mx-1" />
                    <select
                        onChange={e => { addSlide(activeIdx, e.target.value as PresentationLayout); e.target.value = '' }}
                        defaultValue=""
                        className="h-8 px-2 text-[12px] font-semibold rounded-md border border-brand-300 bg-brand-50 text-brand-700 cursor-pointer focus:outline-none"
                    >
                        <option value="" disabled>+ Слайд</option>
                        {Object.entries(LAYOUT_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                        ))}
                    </select>
                </div>

                {/* Form */}
                <div className="flex-1 overflow-y-auto p-5">
                    {slide ? <SlideEditor slide={slide} onChange={s => updateSlide(activeIdx, s)} /> : null}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-ink-200 bg-surface flex items-center gap-2 justify-end">
                    <span className="text-[12px] text-ink-500 mr-auto">
                        {dirty ? <span className="text-warning-700 font-semibold">• Несохранённые изменения</span> : 'Без изменений'}
                    </span>
                    <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="w-3.5 h-3.5" />} onClick={onCancel} disabled={saving}>
                        Отмена
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<Save className="w-3.5 h-3.5" />}
                        onClick={() => onSave(data)}
                        disabled={!dirty || saving}
                        loading={saving}
                    >
                        {saving ? 'Сохраняем…' : 'Сохранить'}
                    </Button>
                </div>
            </main>
        </div>
    )
}
