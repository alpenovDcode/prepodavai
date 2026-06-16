'use client'

import { useId, type ReactNode } from 'react'
import { Trash2, Plus } from 'lucide-react'
import type { Block } from '@/lib/blocks/schema'
import { BlockRenderer } from '@/components/blocks/Blocks'

/**
 * Inline-редакторы для каждого типа блока.
 *
 * UX-принципы:
 *   - В обычном виде (не selected) показываем БлокRenderer — учитель видит ровно то,
 *     что увидит ученик.
 *   - При выделении (клик по блоку) разворачиваем форму прямо на месте блока.
 *   - Поля формы — обычные input/textarea без contentEditable. Никаких WYSIWYG-сюрпризов.
 *   - Каждое изменение поля сразу триггерит onChange — родитель сохраняет в state документа.
 *   - Save обновляет outputDoc целиком через PATCH (не диффы — простая модель).
 *
 * Контракт: <BlockEditor block onChange selected onSelect />.
 *   onChange(next) — получает новый объект блока (с тем же id).
 */

export interface BlockEditorProps {
    block: Block
    selected: boolean
    onSelect: () => void
    onChange: (next: Block) => void
}

export function BlockEditor({ block, selected, onSelect, onChange }: BlockEditorProps) {
    if (!selected) {
        // Read-only превью с кликом на выделение.
        return (
            <div onClick={onSelect} className="cursor-pointer">
                <BlockRenderer block={block} showAnswers={false} />
            </div>
        )
    }

    // Редактор для каждого типа.
    switch (block.type) {
        case 'heading':
            return <HeadingEditor block={block} onChange={onChange} />
        case 'paragraph':
            return <ParagraphEditor block={block} onChange={onChange} />
        case 'callout':
            return <CalloutEditor block={block} onChange={onChange} />
        case 'spacer':
            return <SpacerEditor block={block} onChange={onChange} />
        case 'math-display':
            return <MathDisplayEditor block={block} onChange={onChange} />
        case 'image':
            return <ImageEditor block={block} onChange={onChange} />
        case 'table':
            return <TableEditor block={block} onChange={onChange} />
        case 'fill-blank':
            return <FillBlankEditor block={block} onChange={onChange} />
        case 'multiple-choice':
            return <MultipleChoiceEditor block={block} onChange={onChange} />
        case 'short-answer':
            return <ShortAnswerEditor block={block} onChange={onChange} />
        case 'matching':
            return <MatchingEditor block={block} onChange={onChange} />
        case 'html-snippet':
            return <HtmlSnippetEditor block={block} onChange={onChange} />
    }
}

// ─── Хелперы UI ─────────────────────────────────────────────────

function Label({ children }: { children: ReactNode }) {
    return <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-500 mb-1">{children}</label>
}

function Field({ children }: { children: ReactNode }) {
    return <div className="mb-3 last:mb-0">{children}</div>
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            type="text"
            {...props}
            className={[
                'w-full px-3 py-2 rounded-md border border-ink-200 bg-white',
                'text-[14px] text-ink-900 placeholder-ink-400',
                'focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15',
                props.className || '',
            ].join(' ')}
        />
    )
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return (
        <textarea
            {...props}
            className={[
                'w-full px-3 py-2 rounded-md border border-ink-200 bg-white',
                'text-[14px] text-ink-900 placeholder-ink-400 resize-y',
                'focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15',
                props.className || '',
            ].join(' ')}
        />
    )
}

function SmallBtn({ onClick, children, danger, title }: { onClick: () => void; children: ReactNode; danger?: boolean; title?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={[
                'inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] font-semibold transition-colors',
                danger ? 'text-danger-600 hover:bg-danger-50' : 'text-ink-600 hover:bg-ink-100',
            ].join(' ')}
        >
            {children}
        </button>
    )
}

// ─── Редакторы по типам ─────────────────────────────────────────

function HeadingEditor({ block, onChange }: { block: Extract<Block, { type: 'heading' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wider">Заголовок</span>
                <select
                    value={block.level}
                    onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
                    className="text-[12px] px-2 py-0.5 border border-ink-200 rounded"
                >
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                </select>
            </div>
            <TextInput
                value={block.text}
                onChange={(e) => onChange({ ...block, text: e.target.value })}
                placeholder="Текст заголовка"
            />
        </div>
    )
}

function ParagraphEditor({ block, onChange }: { block: Extract<Block, { type: 'paragraph' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Абзац · поддерживает $формулы$</div>
            <TextArea
                value={block.text}
                onChange={(e) => onChange({ ...block, text: e.target.value })}
                rows={3}
                placeholder="Текст абзаца. Формулы — между знаками $, например: $V = a \cdot b$"
            />
        </div>
    )
}

function CalloutEditor({ block, onChange }: { block: Extract<Block, { type: 'callout' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wider">Выноска</span>
                <select
                    value={block.variant}
                    onChange={(e) => onChange({ ...block, variant: e.target.value as any })}
                    className="text-[12px] px-2 py-0.5 border border-ink-200 rounded"
                >
                    <option value="info">Инфо</option>
                    <option value="warning">Внимание</option>
                    <option value="success">Успех</option>
                    <option value="tip">Подсказка</option>
                    <option value="methodology">Методика</option>
                </select>
            </div>
            <Field>
                <Label>Заголовок (опц.)</Label>
                <TextInput
                    value={block.title || ''}
                    onChange={(e) => onChange({ ...block, title: e.target.value || undefined })}
                    placeholder="Подсказка / Условие / Внимание"
                />
            </Field>
            <Field>
                <Label>Текст</Label>
                <TextArea
                    value={block.text}
                    onChange={(e) => onChange({ ...block, text: e.target.value })}
                    rows={2}
                />
            </Field>
        </div>
    )
}

function SpacerEditor({ block, onChange }: { block: Extract<Block, { type: 'spacer' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Отступ</div>
            <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink-700">Размер:</span>
                {(['sm', 'md', 'lg'] as const).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => onChange({ ...block, size: s })}
                        className={[
                            'px-3 py-1 text-[13px] rounded-md border transition-colors',
                            block.size === s ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                        ].join(' ')}
                    >
                        {s === 'sm' ? 'Маленький' : s === 'md' ? 'Средний' : 'Большой'}
                    </button>
                ))}
            </div>
        </div>
    )
}

function MathDisplayEditor({ block, onChange }: { block: Extract<Block, { type: 'math-display' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Формула (LaTeX)</div>
            <Field>
                <TextArea
                    value={block.latex}
                    onChange={(e) => onChange({ ...block, latex: e.target.value })}
                    rows={2}
                    placeholder={'V = a \\cdot b \\cdot c'}
                    className="font-mono text-[14px]"
                />
            </Field>
            <Field>
                <Label>Подпись (опц.)</Label>
                <TextInput
                    value={block.caption || ''}
                    onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
                    placeholder="Формула объёма"
                />
            </Field>
        </div>
    )
}

function ImageEditor({ block, onChange }: { block: Extract<Block, { type: 'image' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Изображение</div>
            <Field>
                <Label>URL</Label>
                <TextInput value={block.src} onChange={(e) => onChange({ ...block, src: e.target.value })} placeholder="https://..." />
            </Field>
            <Field>
                <Label>Alt-текст</Label>
                <TextInput value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Описание для доступности" />
            </Field>
            <Field>
                <Label>Подпись (опц.)</Label>
                <TextInput value={block.caption || ''} onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })} />
            </Field>
        </div>
    )
}

function TableEditor({ block, onChange }: { block: Extract<Block, { type: 'table' }>; onChange: (b: Block) => void }) {
    const updateHeader = (i: number, v: string) => {
        const next = [...block.headers]
        next[i] = v
        onChange({ ...block, headers: next })
    }
    const updateCell = (r: number, c: number, v: string) => {
        const next = block.rows.map((row) => [...row])
        if (!next[r]) next[r] = []
        next[r][c] = v
        onChange({ ...block, rows: next })
    }
    const addCol = () => {
        onChange({
            ...block,
            headers: [...block.headers, ''],
            rows: block.rows.map((r) => [...r, '']),
        })
    }
    const removeCol = (i: number) => {
        if (block.headers.length <= 1) return
        onChange({
            ...block,
            headers: block.headers.filter((_, k) => k !== i),
            rows: block.rows.map((r) => r.filter((_, k) => k !== i)),
        })
    }
    const addRow = () => onChange({ ...block, rows: [...block.rows, block.headers.map(() => '')] })
    const removeRow = (i: number) => onChange({ ...block, rows: block.rows.filter((_, k) => k !== i) })

    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Таблица</div>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            {block.headers.map((h, i) => (
                                <th key={i} className="border border-ink-200 p-1.5 bg-ink-50">
                                    <div className="flex items-center gap-1">
                                        <TextInput value={h} onChange={(e) => updateHeader(i, e.target.value)} placeholder={`Колонка ${i + 1}`} />
                                        <SmallBtn onClick={() => removeCol(i)} danger title="Удалить колонку"><Trash2 className="w-3 h-3" /></SmallBtn>
                                    </div>
                                </th>
                            ))}
                            <th className="border border-ink-200 p-1.5 bg-ink-50 align-middle">
                                <SmallBtn onClick={addCol}><Plus className="w-3 h-3" /></SmallBtn>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {block.rows.map((row, r) => (
                            <tr key={r}>
                                {block.headers.map((_, c) => (
                                    <td key={c} className="border border-ink-200 p-1.5">
                                        <TextInput value={row[c] || ''} onChange={(e) => updateCell(r, c, e.target.value)} />
                                    </td>
                                ))}
                                <td className="border border-ink-200 p-1.5 align-middle">
                                    <SmallBtn onClick={() => removeRow(r)} danger><Trash2 className="w-3 h-3" /></SmallBtn>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-2">
                <SmallBtn onClick={addRow}><Plus className="w-3 h-3" /> Строку</SmallBtn>
            </div>
            <Field>
                <Label>Подпись (опц.)</Label>
                <TextInput value={block.caption || ''} onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })} />
            </Field>
        </div>
    )
}

function FillBlankEditor({ block, onChange }: { block: Extract<Block, { type: 'fill-blank' }>; onChange: (b: Block) => void }) {
    const updateBlank = (idx: number, patch: Partial<typeof block.blanks[number]>) => {
        onChange({ ...block, blanks: block.blanks.map((b) => (b.index === idx ? { ...b, ...patch } : b)) })
    }
    const removeBlank = (idx: number) => {
        onChange({ ...block, blanks: block.blanks.filter((b) => b.index !== idx) })
    }
    const addBlank = () => {
        const nextIdx = (block.blanks.reduce((m, b) => Math.max(m, b.index), 0) || 0) + 1
        onChange({ ...block, blanks: [...block.blanks, { index: nextIdx, answer: '' }] })
    }
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Заполни пропуски · в шаблоне используй {`{{1}}`} {`{{2}}`} …</div>
            <Field>
                <Label>Шаблон</Label>
                <TextArea
                    value={block.template}
                    onChange={(e) => onChange({ ...block, template: e.target.value })}
                    rows={3}
                    placeholder={'Объём = {{1}} · {{2}} · {{3}}.'}
                />
            </Field>
            <Field>
                <Label>Пропуски и ответы</Label>
                <div className="space-y-1.5">
                    {block.blanks.map((b) => (
                        <div key={b.index} className="flex items-center gap-2">
                            <span className="font-mono text-[12px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded shrink-0">{`{{${b.index}}}`}</span>
                            <TextInput value={b.answer} onChange={(e) => updateBlank(b.index, { answer: e.target.value })} placeholder="Правильный ответ" />
                            <TextInput value={b.hint || ''} onChange={(e) => updateBlank(b.index, { hint: e.target.value || undefined })} placeholder="Подсказка (опц.)" />
                            <SmallBtn onClick={() => removeBlank(b.index)} danger><Trash2 className="w-3 h-3" /></SmallBtn>
                        </div>
                    ))}
                    <SmallBtn onClick={addBlank}><Plus className="w-3 h-3" /> пропуск</SmallBtn>
                </div>
            </Field>
        </div>
    )
}

function MultipleChoiceEditor({ block, onChange }: { block: Extract<Block, { type: 'multiple-choice' }>; onChange: (b: Block) => void }) {
    const updateOpt = (i: number, patch: Partial<typeof block.options[number]>) => {
        const next = block.options.map((o, k) => (k === i ? { ...o, ...patch } : o))
        // Для single-choice не разрешаем 2+ правильных.
        if (!block.multiple && patch.correct === true) {
            for (let k = 0; k < next.length; k++) if (k !== i) next[k] = { ...next[k], correct: false }
        }
        onChange({ ...block, options: next })
    }
    const addOpt = () => {
        const newId = `o${Date.now().toString(36).slice(-4)}`
        onChange({ ...block, options: [...block.options, { id: newId, text: '', correct: false }] })
    }
    const removeOpt = (i: number) => {
        if (block.options.length <= 2) return
        onChange({ ...block, options: block.options.filter((_, k) => k !== i) })
    }
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-bold text-brand-600 uppercase tracking-wider">Выбор ответа</span>
                <label className="flex items-center gap-1.5 text-[12px] text-ink-700 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={block.multiple}
                        onChange={(e) => onChange({ ...block, multiple: e.target.checked })}
                        className="accent-brand-500"
                    />
                    Несколько правильных
                </label>
            </div>
            <Field>
                <Label>Вопрос</Label>
                <TextArea value={block.question} onChange={(e) => onChange({ ...block, question: e.target.value })} rows={2} />
            </Field>
            <Field>
                <Label>Варианты</Label>
                <div className="space-y-1.5">
                    {block.options.map((opt, i) => (
                        <div key={opt.id} className="flex items-center gap-2">
                            <input
                                type={block.multiple ? 'checkbox' : 'radio'}
                                checked={opt.correct}
                                onChange={(e) => updateOpt(i, { correct: e.target.checked })}
                                className="accent-brand-500 flex-shrink-0"
                                title="Правильный ответ"
                            />
                            <TextInput value={opt.text} onChange={(e) => updateOpt(i, { text: e.target.value })} placeholder={`Вариант ${i + 1}`} />
                            <SmallBtn onClick={() => removeOpt(i)} danger title="Удалить"><Trash2 className="w-3 h-3" /></SmallBtn>
                        </div>
                    ))}
                    <SmallBtn onClick={addOpt}><Plus className="w-3 h-3" /> вариант</SmallBtn>
                </div>
            </Field>
        </div>
    )
}

function ShortAnswerEditor({ block, onChange }: { block: Extract<Block, { type: 'short-answer' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Краткий ответ</div>
            <Field>
                <Label>Вопрос</Label>
                <TextArea value={block.question} onChange={(e) => onChange({ ...block, question: e.target.value })} rows={2} />
            </Field>
            <Field>
                <Label>Длина поля</Label>
                <div className="flex items-center gap-1.5">
                    {(['short', 'medium', 'long'] as const).map((l) => (
                        <button
                            key={l}
                            type="button"
                            onClick={() => onChange({ ...block, expectedLength: l })}
                            className={[
                                'px-3 py-1 text-[13px] rounded-md border transition-colors',
                                block.expectedLength === l ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                            ].join(' ')}
                        >
                            {l === 'short' ? 'Короткое' : l === 'medium' ? 'Среднее' : 'Длинное'}
                        </button>
                    ))}
                </div>
            </Field>
            <Field>
                <Label>Эталонный ответ (для проверки, опц.)</Label>
                <TextArea
                    value={block.expectedAnswer || ''}
                    onChange={(e) => onChange({ ...block, expectedAnswer: e.target.value || undefined })}
                    rows={2}
                />
            </Field>
        </div>
    )
}

function MatchingEditor({ block, onChange }: { block: Extract<Block, { type: 'matching' }>; onChange: (b: Block) => void }) {
    const updateLeft = (i: number, text: string) => {
        const next = [...block.left]
        next[i] = { ...next[i], text }
        onChange({ ...block, left: next })
    }
    const updateRight = (i: number, text: string) => {
        const next = [...block.right]
        next[i] = { ...next[i], text }
        onChange({ ...block, right: next })
    }
    const addLeft = () => {
        const id = `L${block.left.length + 1}`
        onChange({ ...block, left: [...block.left, { id, text: '' }] })
    }
    const addRight = () => {
        const id = `R${block.right.length + 1}`
        onChange({ ...block, right: [...block.right, { id, text: '' }] })
    }
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">Сопоставление</div>
            <Field>
                <Label>Инструкция</Label>
                <TextInput value={block.instruction} onChange={(e) => onChange({ ...block, instruction: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
                <Field>
                    <Label>Левая колонка</Label>
                    <div className="space-y-1.5">
                        {block.left.map((l, i) => (
                            <div key={l.id} className="flex items-center gap-1.5">
                                <span className="text-[12px] text-ink-500 font-mono shrink-0">{l.id}</span>
                                <TextInput value={l.text} onChange={(e) => updateLeft(i, e.target.value)} />
                            </div>
                        ))}
                        <SmallBtn onClick={addLeft}><Plus className="w-3 h-3" /> пункт</SmallBtn>
                    </div>
                </Field>
                <Field>
                    <Label>Правая колонка</Label>
                    <div className="space-y-1.5">
                        {block.right.map((r, i) => (
                            <div key={r.id} className="flex items-center gap-1.5">
                                <span className="text-[12px] text-ink-500 font-mono shrink-0">{r.id}</span>
                                <TextInput value={r.text} onChange={(e) => updateRight(i, e.target.value)} />
                            </div>
                        ))}
                        <SmallBtn onClick={addRight}><Plus className="w-3 h-3" /> пункт</SmallBtn>
                    </div>
                </Field>
            </div>
            <Field>
                <Label>Правильные пары (через запятую, например: L1=R2, L2=R1)</Label>
                <TextInput
                    value={block.pairs.map(([l, r]) => `${l}=${r}`).join(', ')}
                    onChange={(e) => {
                        const pairs = e.target.value
                            .split(',')
                            .map((p) => p.trim())
                            .filter(Boolean)
                            .map((p) => p.split('=').map((s) => s.trim()))
                            .filter((p) => p.length === 2) as [string, string][]
                        onChange({ ...block, pairs })
                    }}
                    placeholder="L1=R1, L2=R2"
                />
            </Field>
        </div>
    )
}

function HtmlSnippetEditor({ block, onChange }: { block: Extract<Block, { type: 'html-snippet' }>; onChange: (b: Block) => void }) {
    return (
        <div className="bg-white border-2 border-brand-300 rounded-md p-3 shadow-sm">
            <div className="text-[11px] font-bold text-brand-600 uppercase tracking-wider mb-2">HTML фрагмент</div>
            <TextArea
                value={block.html}
                onChange={(e) => onChange({ ...block, html: e.target.value })}
                rows={4}
                className="font-mono text-[13px]"
            />
        </div>
    )
}
