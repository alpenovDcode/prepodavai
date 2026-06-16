'use client'

import { useState, useRef, useEffect } from 'react'
import {
    Heading1, AlignLeft, MessageSquareWarning, Plus, Calculator, Image as ImageIcon,
    Table as TableIcon, ListChecks, CheckSquare, PenLine, ArrowLeftRight, Minus, Code2, BookOpen,
} from 'lucide-react'
import type { Block, GenerationDocument as GenerationDocumentT } from '@/lib/blocks/schema'
import { EditableBlock } from './EditableBlock'
import { BlockEditor } from './BlockEditors'

/**
 * Главный компонент редактора документа.
 *
 * UX-сценарий:
 *   1) Шапка с inline-полями: title + meta (предмет/класс/длительность/дата).
 *   2) Список блоков. Каждый блок:
 *        - read-only вид (BlockRenderer) до клика
 *        - после клика — inline-редактор (BlockEditor)
 *        - hover показывает контролы (↑↓, дублировать, удалить)
 *        - между блоками — кнопка «+ блок» при hover'е
 *   3) Внизу — «+ Добавить первый блок» (если документ пуст или в конце).
 *   4) Save поднимается родителю через onSave — он сделает PATCH.
 *
 * Состояние документа полностью локальное. Родитель видит финальный
 * outputDoc только через onSave. Это даёт возможность отмены (drop changes
 * = revert к исходному doc'у).
 */

export interface DocumentEditorProps {
    initialDoc: GenerationDocumentT
    /** Колбэк сохранения. Получает текущий снимок документа. */
    onSave: (doc: GenerationDocumentT) => Promise<void> | void
    /** Колбэк отмены изменений. */
    onCancel?: () => void
    /** Извне можно показать «сохраняется...» */
    saving?: boolean
}

export function DocumentEditor({ initialDoc, onSave, onCancel, saving }: DocumentEditorProps) {
    const [doc, setDoc] = useState<GenerationDocumentT>(initialDoc)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [addMenuAt, setAddMenuAt] = useState<number | null>(null)

    // При изменении initialDoc (например, regenerate) сбрасываем локальное состояние.
    useEffect(() => { setDoc(initialDoc); setSelectedId(null) }, [initialDoc])

    // Снимаем выделение, если кликнули вне блока.
    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            const t = e.target as HTMLElement
            if (!t.closest('[data-block-id]') && !t.closest('[data-add-menu]') && !t.closest('input, textarea, select, button')) {
                setSelectedId(null)
            }
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [])

    // ── Мутации блоков ──
    const updateBlock = (id: string, next: Block) =>
        setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? next : b)) }))

    const moveBlock = (idx: number, dir: -1 | 1) => {
        setDoc((d) => {
            const blocks = [...d.blocks]
            const next = idx + dir
            if (next < 0 || next >= blocks.length) return d
            ;[blocks[idx], blocks[next]] = [blocks[next], blocks[idx]]
            return { ...d, blocks }
        })
    }

    const deleteBlock = (idx: number) => {
        setDoc((d) => ({ ...d, blocks: d.blocks.filter((_, k) => k !== idx) }))
    }

    const duplicateBlock = (idx: number) => {
        setDoc((d) => {
            const blocks = [...d.blocks]
            const copy = cloneBlockWithNewId(blocks[idx])
            blocks.splice(idx + 1, 0, copy)
            return { ...d, blocks }
        })
    }

    const insertBlock = (atIndex: number, newBlock: Block) => {
        setDoc((d) => {
            const blocks = [...d.blocks]
            blocks.splice(atIndex, 0, newBlock)
            return { ...d, blocks }
        })
        setSelectedId(newBlock.id)
        setAddMenuAt(null)
    }

    // ── Мутации шапки ──
    const updateTitle = (v: string) => setDoc((d) => ({ ...d, title: v }))
    const updateMeta = (key: keyof NonNullable<GenerationDocumentT['meta']>, v: string) =>
        setDoc((d) => ({ ...d, meta: { ...(d.meta || {}), [key]: v || undefined } }))

    return (
        <div className="mx-auto max-w-[840px] bg-white rounded-xl shadow-sm border border-ink-100 p-10 max-md:p-5 relative">
            {/* Toolbar сверху */}
            <div className="sticky top-0 z-20 flex items-center justify-end gap-2 pb-4 mb-4 border-b border-ink-100 bg-white">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="px-4 py-2 rounded-md text-[13px] font-semibold text-ink-700 hover:bg-ink-100 transition-colors disabled:opacity-50"
                    >
                        Отменить
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => onSave(doc)}
                    disabled={saving}
                    className="px-4 py-2 rounded-md text-[13px] font-semibold bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50"
                >
                    {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
            </div>

            {/* Шапка документа */}
            <header className="mb-7 pb-5 border-b-2 border-ink-100">
                <input
                    value={doc.title}
                    onChange={(e) => updateTitle(e.target.value)}
                    placeholder="Название документа"
                    className="w-full font-display font-bold text-[28px] leading-tight text-ink-900 bg-transparent border-none focus:outline-none focus:ring-0 focus:bg-brand-50 rounded px-2 py-1 -mx-2"
                />
                <MetaEditor doc={doc} onUpdate={updateMeta} />
            </header>

            {/* Список блоков */}
            <div className="pl-9 max-md:pl-0">
                {doc.blocks.length === 0 && (
                    <div className="py-10 text-center text-ink-500 border-2 border-dashed border-ink-200 rounded-md">
                        <p className="text-[14px] mb-3">Документ пуст. Добавьте первый блок.</p>
                        <AddBlockButton onPick={(b) => insertBlock(0, b)} />
                    </div>
                )}
                {doc.blocks.map((block, idx) => (
                    <div key={block.id} data-block-id={block.id} className="mb-3">
                        <EditableBlock
                            isFirst={idx === 0}
                            isLast={idx === doc.blocks.length - 1}
                            selected={selectedId === block.id}
                            onClick={() => setSelectedId(block.id)}
                            onMoveUp={() => moveBlock(idx, -1)}
                            onMoveDown={() => moveBlock(idx, 1)}
                            onDuplicate={() => duplicateBlock(idx)}
                            onDelete={() => { deleteBlock(idx); if (selectedId === block.id) setSelectedId(null) }}
                            onAddAfter={() => setAddMenuAt(idx + 1)}
                        >
                            <BlockEditor
                                block={block}
                                selected={selectedId === block.id}
                                onSelect={() => setSelectedId(block.id)}
                                onChange={(next) => updateBlock(block.id, next)}
                            />
                        </EditableBlock>

                        {addMenuAt === idx + 1 && (
                            <div data-add-menu className="my-2">
                                <AddBlockPanel
                                    onPick={(b) => insertBlock(idx + 1, b)}
                                    onClose={() => setAddMenuAt(null)}
                                />
                            </div>
                        )}
                    </div>
                ))}

                {doc.blocks.length > 0 && addMenuAt === null && (
                    <div className="mt-4">
                        <AddBlockButton onPick={(b) => insertBlock(doc.blocks.length, b)} />
                    </div>
                )}
            </div>
        </div>
    )
}

function MetaEditor({
    doc, onUpdate,
}: {
    doc: GenerationDocumentT
    onUpdate: (key: keyof NonNullable<GenerationDocumentT['meta']>, v: string) => void
}) {
    const meta = doc.meta || {}
    return (
        <div className="mt-3 grid grid-cols-5 max-md:grid-cols-2 gap-2.5">
            <MetaField label="Предмет" value={meta.subject || ''} onChange={(v) => onUpdate('subject', v)} />
            <MetaField label="Класс" value={meta.grade || ''} onChange={(v) => onUpdate('grade', v)} />
            <MetaField label="Длительность" value={meta.duration || ''} onChange={(v) => onUpdate('duration', v)} />
            <MetaField label="Ученик" value={meta.studentName || ''} onChange={(v) => onUpdate('studentName', v)} />
            <MetaField label="Дата" value={meta.date || ''} onChange={(v) => onUpdate('date', v)} />
        </div>
    )
}

function MetaField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <label className="block">
            <span className="block text-[10.5px] font-bold uppercase tracking-wider text-ink-500 mb-0.5">{label}</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-2 py-1 rounded border border-ink-200 bg-white text-[13px] text-ink-900 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/15"
            />
        </label>
    )
}

// ─── Кнопка / меню добавления блока ─────────────────────────────

interface BlockTemplate {
    label: string
    type: Block['type']
    Icon: React.ComponentType<{ className?: string }>
    make: () => Block
}

// Главные 5 типов — на виду в палитре. Покрывают 95% случаев правки worksheet/quiz.
const PRIMARY_TEMPLATES: BlockTemplate[] = [
    { label: 'Текст', type: 'paragraph', Icon: AlignLeft, make: () => ({ type: 'paragraph', id: newId('p'), text: 'Введите текст…' }) },
    { label: 'Заголовок', type: 'heading', Icon: Heading1, make: () => ({ type: 'heading', id: newId('h'), level: 2, text: 'Задание ' }) },
    { label: 'Заполнить пропуски', type: 'fill-blank', Icon: PenLine, make: () => ({ type: 'fill-blank', id: newId('fb'), template: 'Например: {{1}} + {{2}} = 4.', blanks: [{ index: 1, answer: '2' }, { index: 2, answer: '2' }] }) },
    { label: 'Выбор ответа', type: 'multiple-choice', Icon: CheckSquare, make: () => ({ type: 'multiple-choice', id: newId('mc'), question: 'Вопрос', options: [{ id: 'a', text: 'Вариант A', correct: true }, { id: 'b', text: 'Вариант B', correct: false }], multiple: false }) },
    { label: 'Короткий ответ', type: 'short-answer', Icon: PenLine, make: () => ({ type: 'short-answer', id: newId('sa'), question: 'Вопрос', expectedLength: 'short' }) },
]

// Дополнительные типы — скрыты под «Ещё». Реже нужны.
const SECONDARY_TEMPLATES: BlockTemplate[] = [
    { label: 'Сопоставление', type: 'matching', Icon: ArrowLeftRight, make: () => ({ type: 'matching', id: newId('m'), instruction: 'Сопоставь:', left: [{ id: 'L1', text: '' }, { id: 'L2', text: '' }], right: [{ id: 'R1', text: '' }, { id: 'R2', text: '' }], pairs: [] }) },
    { label: 'Формула', type: 'math-display', Icon: Calculator, make: () => ({ type: 'math-display', id: newId('md'), latex: 'a^2 + b^2 = c^2' }) },
    { label: 'Подсказка', type: 'callout', Icon: MessageSquareWarning, make: () => ({ type: 'callout', id: newId('c'), variant: 'tip', text: 'Важное уточнение' }) },
    { label: 'Таблица', type: 'table', Icon: TableIcon, make: () => ({ type: 'table', id: newId('t'), headers: ['Колонка 1', 'Колонка 2'], rows: [['', ''], ['', '']] }) },
    { label: 'Изображение', type: 'image', Icon: ImageIcon, make: () => ({ type: 'image', id: newId('img'), src: '', alt: '' }) },
    { label: 'Словарная статья', type: 'vocab-entry', Icon: BookOpen, make: () => ({ type: 'vocab-entry', id: newId('v'), term: 'новое слово', translation: 'перевод' }) },
    { label: 'Отступ', type: 'spacer', Icon: Minus, make: () => ({ type: 'spacer', id: newId('sp'), size: 'md' }) },
]

function AddBlockButton({ onPick }: { onPick: (b: Block) => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])
    return (
        <div className="relative inline-block" ref={ref} data-add-menu>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand-50 text-brand-700 text-[13px] font-semibold hover:bg-brand-100 transition-colors"
            >
                <Plus className="w-3.5 h-3.5" /> Добавить блок
            </button>
            {open && <AddBlockPalette onPick={(b) => { onPick(b); setOpen(false) }} />}
        </div>
    )
}

function AddBlockPanel({ onPick, onClose }: { onPick: (b: Block) => void; onClose: () => void }) {
    return (
        <div data-add-menu className="bg-white border border-ink-200 rounded-md shadow-md p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Добавить блок</span>
                <button type="button" onClick={onClose} className="text-[12px] text-ink-500 hover:text-ink-900">Закрыть</button>
            </div>
            <BlockGrid templates={PRIMARY_TEMPLATES} onPick={onPick} />
            <SecondaryToggle onPick={onPick} />
        </div>
    )
}

function BlockGrid({ templates, onPick }: { templates: BlockTemplate[]; onPick: (b: Block) => void }) {
    return (
        <div className="grid grid-cols-3 gap-1.5 max-md:grid-cols-2">
            {templates.map((t) => (
                <button
                    key={t.type}
                    type="button"
                    onClick={() => onPick(t.make())}
                    className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-ink-50 text-left transition-colors border border-ink-100"
                >
                    <t.Icon className="w-4 h-4 text-brand-600 shrink-0" />
                    <span className="text-[13px] text-ink-800">{t.label}</span>
                </button>
            ))}
        </div>
    )
}

function SecondaryToggle({ onPick }: { onPick: (b: Block) => void }) {
    const [open, setOpen] = useState(false)
    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 text-[12px] text-ink-500 hover:text-ink-900 flex items-center gap-1"
            >
                <span>▾</span> Ещё типы блоков ({SECONDARY_TEMPLATES.length})
            </button>
        )
    }
    return (
        <div className="mt-2 pt-2 border-t border-ink-100">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">Дополнительные</div>
            <BlockGrid templates={SECONDARY_TEMPLATES} onPick={onPick} />
        </div>
    )
}

function AddBlockPalette({ onPick }: { onPick: (b: Block) => void }) {
    return (
        <div className="absolute z-30 mt-1.5 w-[420px] max-w-[90vw] bg-white border border-ink-200 rounded-md shadow-lg p-3">
            <BlockGrid templates={PRIMARY_TEMPLATES} onPick={onPick} />
            <SecondaryToggle onPick={onPick} />
        </div>
    )
}

// ─── Утилиты ─────────────────────────────

function newId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function cloneBlockWithNewId<T extends Block>(b: T): T {
    return { ...b, id: newId(b.type.charAt(0)) } as T
}
