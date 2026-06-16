'use client'

import { useId } from 'react'
import { InlineMathText, MathDisplay } from './Math'
import type { Block } from '@/lib/blocks/schema'

/**
 * Read-only компоненты для каждого типа блока.
 * Интерактивные блоки (fill-blank, multiple-choice, short-answer, matching)
 * принимают опциональные пропсы для управления ответом — `value`/`onChange` —
 * чтобы переиспользоваться в нескольких режимах: превью у учителя
 * (без интерактива), заполнение учеником, чтение проверенного ДЗ.
 */

// ───────── Простые ─────────

export function Heading({ level, text }: { level: 1 | 2 | 3; text: string }) {
    const Tag = (`h${level}` as 'h1' | 'h2' | 'h3')
    const cls =
        level === 1 ? 'font-display font-bold text-[28px] text-ink-900 mt-0 mb-4' :
        level === 2 ? 'font-display font-bold text-[20px] text-ink-800 mt-8 mb-3' :
                     'font-semibold text-[17px] text-ink-700 mt-6 mb-2'
    return <Tag className={cls}><InlineMathText text={text} /></Tag>
}

export function Paragraph({ text }: { text: string }) {
    return <p className="text-[15px] leading-7 text-ink-800 mb-4"><InlineMathText text={text} /></p>
}

export function Callout({
    variant, title, text,
}: { variant: 'info' | 'warning' | 'success' | 'tip' | 'methodology'; title?: string; text: string }) {
    const styles: Record<typeof variant, string> = {
        info: 'bg-sky-50 border-sky-400 text-sky-900',
        warning: 'bg-amber-50 border-amber-400 text-amber-900',
        success: 'bg-emerald-50 border-emerald-400 text-emerald-900',
        tip: 'bg-violet-50 border-violet-400 text-violet-900',
        methodology: 'bg-ink-50 border-ink-400 text-ink-900',
    } as const
    return (
        <aside className={`my-4 border-l-4 rounded-r-md px-4 py-3 ${styles[variant]}`}>
            {title && <div className="font-bold text-[14px] mb-1">{title}</div>}
            <div className="text-[14.5px] leading-6"><InlineMathText text={text} /></div>
        </aside>
    )
}

export function Spacer({ size }: { size: 'sm' | 'md' | 'lg' }) {
    const h = size === 'sm' ? 'h-3' : size === 'md' ? 'h-6' : 'h-12'
    return <div className={h} aria-hidden />
}

export function ImageBlock({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
    return (
        <figure className="my-5">
            <img src={src} alt={alt} className="max-w-full h-auto rounded-md mx-auto block" />
            {caption && <figcaption className="text-center text-sm text-ink-500 mt-2">{caption}</figcaption>}
        </figure>
    )
}

export function TableBlock({ headers, rows, caption }: { headers: string[]; rows: string[][]; caption?: string }) {
    return (
        <figure className="my-5 overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
                <thead>
                    <tr>
                        {headers.map((h, i) => (
                            <th key={i} className="bg-ink-50 font-semibold text-left p-3 border border-ink-200">
                                <InlineMathText text={h} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>
                            {row.map((cell, j) => (
                                <td key={j} className="p-3 border border-ink-200 align-top">
                                    <InlineMathText text={cell} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {caption && <figcaption className="text-center text-sm text-ink-500 mt-2">{caption}</figcaption>}
        </figure>
    )
}

// ───────── Интерактивные ─────────

export interface InteractiveProps {
    /** Текущее значение ответа (если контролируется снаружи). */
    value?: any
    /** Колбэк изменения; если не задан — поле read-only. */
    onChange?: (next: any) => void
    /** Показывать ли правильные ответы (для tabs «С ответами» / проверки ДЗ). */
    showAnswers?: boolean
}

export function FillBlank({
    template, blanks, value, onChange, showAnswers,
}: {
    template: string
    blanks: { index: number; answer: string; hint?: string }[]
} & InteractiveProps) {
    // template: "Найти $V = a \cdot b \cdot c$, если a = {{1}}, b = {{2}}."
    // Делим по `{{N}}`, между сегментами вставляем input.
    const parts = template.split(/(\{\{\d+\}\})/g)
    const byIndex = new Map(blanks.map(b => [b.index, b]))
    return (
        <p className="text-[15px] leading-8 text-ink-800 my-4">
            {parts.map((part, i) => {
                const m = part.match(/^\{\{(\d+)\}\}$/)
                if (!m) return <span key={i}><InlineMathText text={part} /></span>
                const idx = Number(m[1])
                const blank = byIndex.get(idx)
                if (!blank) return <span key={i} className="text-danger-600">{`[${idx}?]`}</span>
                if (showAnswers) {
                    return (
                        <span key={i} className="inline-block px-1.5 py-0.5 mx-0.5 rounded-sm bg-success-50 text-success-800 font-semibold">
                            {blank.answer}
                        </span>
                    )
                }
                return (
                    <input
                        key={i}
                        type="text"
                        value={value?.[idx] ?? ''}
                        onChange={onChange ? (e) => onChange({ ...(value || {}), [idx]: e.target.value }) : undefined}
                        readOnly={!onChange}
                        placeholder={blank.hint || '___'}
                        className="inline-block w-[110px] mx-0.5 px-2 py-0.5 border-b border-ink-400 bg-transparent text-[15px] focus:outline-none focus:border-brand-500"
                    />
                )
            })}
        </p>
    )
}

export function MultipleChoice({
    question, options, multiple = false, value, onChange, showAnswers,
}: {
    question: string
    options: { id: string; text: string; correct: boolean }[]
    multiple?: boolean
} & InteractiveProps) {
    const groupId = useId()
    const selected: Set<string> = new Set(Array.isArray(value) ? value : value ? [value] : [])
    const toggle = (optId: string) => {
        if (!onChange) return
        if (multiple) {
            const next = new Set(selected)
            if (next.has(optId)) next.delete(optId)
            else next.add(optId)
            onChange(Array.from(next))
        } else {
            onChange(optId)
        }
    }
    return (
        <div className="my-4">
            <p className="text-[15px] font-semibold text-ink-900 mb-2.5"><InlineMathText text={question} /></p>
            <ul className="space-y-2">
                {options.map((opt) => {
                    const isSelected = selected.has(opt.id)
                    const isCorrect = opt.correct
                    const showCorrectness = showAnswers
                    return (
                        <li key={opt.id}>
                            <label className={`flex items-start gap-2.5 cursor-pointer rounded-md px-2.5 py-1.5 transition-colors ${onChange ? 'hover:bg-ink-50' : ''} ${
                                showCorrectness && isCorrect ? 'bg-success-50' : ''
                            }`}>
                                <input
                                    type={multiple ? 'checkbox' : 'radio'}
                                    name={groupId}
                                    checked={isSelected}
                                    onChange={() => toggle(opt.id)}
                                    disabled={!onChange}
                                    className="mt-1 accent-brand-500"
                                />
                                <span className="text-[15px] leading-6 text-ink-800 flex-1">
                                    <InlineMathText text={opt.text} />
                                    {showCorrectness && isCorrect && (
                                        <span className="ml-2 text-success-700 font-semibold">✓</span>
                                    )}
                                </span>
                            </label>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

export function ShortAnswer({
    question, expectedAnswer, expectedLength = 'short', value, onChange, showAnswers,
}: {
    question: string
    expectedAnswer?: string
    expectedLength?: 'short' | 'medium' | 'long'
} & InteractiveProps) {
    const rows = expectedLength === 'long' ? 5 : expectedLength === 'medium' ? 3 : 1
    return (
        <div className="my-4">
            <p className="text-[15px] font-semibold text-ink-900 mb-2"><InlineMathText text={question} /></p>
            {rows === 1 ? (
                <input
                    type="text"
                    value={value ?? ''}
                    onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                    readOnly={!onChange}
                    className="w-full px-3 py-2 border border-ink-200 rounded-md text-[15px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15"
                />
            ) : (
                <textarea
                    value={value ?? ''}
                    onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                    readOnly={!onChange}
                    rows={rows}
                    className="w-full px-3 py-2 border border-ink-200 rounded-md text-[15px] focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-400/15 resize-none"
                />
            )}
            {showAnswers && expectedAnswer && (
                <div className="mt-2 text-[13.5px] text-success-700 bg-success-50 rounded-md px-3 py-2">
                    <span className="font-semibold">Ожидаемый ответ:</span> <InlineMathText text={expectedAnswer} />
                </div>
            )}
        </div>
    )
}

export function Matching({
    instruction, left, right, pairs, value, onChange, showAnswers,
}: {
    instruction: string
    left: { id: string; text: string }[]
    right: { id: string; text: string }[]
    pairs: [string, string][]
} & InteractiveProps) {
    // MVP: read-only представление. Интерактив (drag/select) — отдельной итерацией.
    const correctMap = new Map(pairs)
    return (
        <div className="my-4">
            <p className="text-[15px] font-semibold text-ink-900 mb-3"><InlineMathText text={instruction} /></p>
            <div className="grid grid-cols-2 gap-4">
                <ol className="space-y-2">
                    {left.map((l) => (
                        <li key={l.id} className="flex items-start gap-2">
                            <span className="font-semibold text-ink-500">{l.id}.</span>
                            <span className="text-[14.5px] text-ink-800"><InlineMathText text={l.text} /></span>
                        </li>
                    ))}
                </ol>
                <ol className="space-y-2">
                    {right.map((r) => (
                        <li key={r.id} className="flex items-start gap-2">
                            <span className="font-semibold text-ink-500">{r.id}.</span>
                            <span className="text-[14.5px] text-ink-800"><InlineMathText text={r.text} /></span>
                        </li>
                    ))}
                </ol>
            </div>
            {showAnswers && pairs.length > 0 && (
                <div className="mt-3 text-[13.5px] text-success-700 bg-success-50 rounded-md px-3 py-2">
                    <span className="font-semibold">Соответствия:</span>{' '}
                    {pairs.map(([l, r], i) => (
                        <span key={i}>{l}→{r}{i < pairs.length - 1 ? ', ' : ''}</span>
                    ))}
                </div>
            )}
        </div>
    )
}

// ───────── Escape hatch ─────────

export function HtmlSnippet({ html }: { html: string }) {
    // Минимальная санитизация — убираем <script>. Полный sanitizer (DOMPurify)
    // подключим позже, когда подключим к реальным генерациям.
    const safe = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    return <div className="my-4" dangerouslySetInnerHTML={{ __html: safe }} />
}

// Re-export MathDisplay для удобства импорта рядом с другими блоками.
export { MathDisplay }

// ───────── BlockRenderer (главный switch) ─────────

export interface BlockRendererProps {
    block: Block
    /** Map blockId → user answer. Если задано, интерактивные блоки управляемые. */
    answers?: Record<string, any>
    /** Колбэк изменения ответа. Если не задан — блоки read-only. */
    onAnswerChange?: (blockId: string, value: any) => void
    /** Показывать правильные ответы (для tabs «С ответами»). */
    showAnswers?: boolean
}

export function BlockRenderer({ block, answers, onAnswerChange, showAnswers }: BlockRendererProps) {
    switch (block.type) {
        case 'heading': return <Heading level={block.level} text={block.text} />
        case 'paragraph': return <Paragraph text={block.text} />
        case 'callout': return <Callout variant={block.variant} title={block.title} text={block.text} />
        case 'spacer': return <Spacer size={block.size} />
        case 'math-display': return <MathDisplay latex={block.latex} caption={block.caption} />
        case 'image': return <ImageBlock src={block.src} alt={block.alt} caption={block.caption} />
        case 'table': return <TableBlock headers={block.headers} rows={block.rows} caption={block.caption} />
        case 'fill-blank': return (
            <FillBlank
                template={block.template}
                blanks={block.blanks}
                value={answers?.[block.id]}
                onChange={onAnswerChange ? (v) => onAnswerChange(block.id, v) : undefined}
                showAnswers={showAnswers}
            />
        )
        case 'multiple-choice': return (
            <MultipleChoice
                question={block.question}
                options={block.options}
                multiple={block.multiple}
                value={answers?.[block.id]}
                onChange={onAnswerChange ? (v) => onAnswerChange(block.id, v) : undefined}
                showAnswers={showAnswers}
            />
        )
        case 'short-answer': return (
            <ShortAnswer
                question={block.question}
                expectedAnswer={block.expectedAnswer}
                expectedLength={block.expectedLength}
                value={answers?.[block.id]}
                onChange={onAnswerChange ? (v) => onAnswerChange(block.id, v) : undefined}
                showAnswers={showAnswers}
            />
        )
        case 'matching': return (
            <Matching
                instruction={block.instruction}
                left={block.left}
                right={block.right}
                pairs={block.pairs}
                value={answers?.[block.id]}
                onChange={onAnswerChange ? (v) => onAnswerChange(block.id, v) : undefined}
                showAnswers={showAnswers}
            />
        )
        case 'html-snippet': return <HtmlSnippet html={block.html} />
    }
}
