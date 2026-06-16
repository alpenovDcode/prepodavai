'use client'

import { useId } from 'react'
import { InlineMathText, MathDisplay } from './Math'
import type { Block } from '@/lib/blocks/schema'

/**
 * Read-only компоненты для каждого типа блока.
 * Используют те же CSS-классы что были в старом AI-HTML
 * (`.callout`, `.inline-input`, `.meta-info` и т.п.) — стили живут
 * в DocumentRenderer.tsx (scoped по `.prepodavai-doc`).
 *
 * Интерактивные блоки (fill-blank, multiple-choice, short-answer, matching)
 * принимают опциональные пропсы `value`/`onChange`/`showAnswers` —
 * переиспользуются в превью у учителя, заполнении учеником, проверке ДЗ.
 */

// ───────── Простые ─────────

export function Heading({ level, text }: { level: 1 | 2 | 3; text: string }) {
    const Tag = (`h${level}` as 'h1' | 'h2' | 'h3')
    return <Tag><InlineMathText text={text} /></Tag>
}

export function Paragraph({ text }: { text: string }) {
    return <p><InlineMathText text={text} /></p>
}

export function Callout({
    variant, title, text,
}: { variant: 'info' | 'warning' | 'success' | 'tip' | 'methodology'; title?: string; text: string }) {
    const cls = variant === 'info' ? 'callout' : `callout callout-${variant}`
    return (
        <div className={cls}>
            {title && <div className="callout-title">{title}</div>}
            <div className="callout-body"><InlineMathText text={text} /></div>
        </div>
    )
}

export function Spacer({ size }: { size: 'sm' | 'md' | 'lg' }) {
    const h = size === 'sm' ? '8px' : size === 'md' ? '20px' : '40px'
    return <div style={{ height: h }} aria-hidden />
}

export function ImageBlock({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
    return (
        <figure>
            <img src={src} alt={alt} style={{ maxWidth: '100%', height: 'auto', borderRadius: 6, display: 'block', margin: '0 auto' }} />
            {caption && <figcaption>{caption}</figcaption>}
        </figure>
    )
}

export function TableBlock({ headers, rows, caption }: { headers: string[]; rows: string[][]; caption?: string }) {
    return (
        <figure>
            <table>
                <thead>
                    <tr>{headers.map((h, i) => <th key={i}><InlineMathText text={h} /></th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>{row.map((c, j) => <td key={j}><InlineMathText text={c} /></td>)}</tr>
                    ))}
                </tbody>
            </table>
            {caption && <figcaption>{caption}</figcaption>}
        </figure>
    )
}

// ───────── Интерактивные ─────────

export interface InteractiveProps {
    value?: any
    onChange?: (next: any) => void
    showAnswers?: boolean
}

export function FillBlank({
    template, blanks, value, onChange, showAnswers,
}: {
    template: string
    blanks: { index: number; answer: string; hint?: string }[]
} & InteractiveProps) {
    const parts = template.split(/(\{\{\d+\}\})/g)
    const byIndex = new Map(blanks.map(b => [b.index, b]))
    return (
        <p>
            {parts.map((part, i) => {
                const m = part.match(/^\{\{(\d+)\}\}$/)
                if (!m) return <span key={i}><InlineMathText text={part} /></span>
                const idx = Number(m[1])
                const blank = byIndex.get(idx)
                if (!blank) return <span key={i} style={{ color: '#dc2626' }}>{`[${idx}?]`}</span>
                if (showAnswers) {
                    return <span key={i} className="answer-chip">{blank.answer}</span>
                }
                return (
                    <input
                        key={i}
                        type="text"
                        className="inline-input"
                        value={value?.[idx] ?? ''}
                        onChange={onChange ? (e) => onChange({ ...(value || {}), [idx]: e.target.value }) : undefined}
                        readOnly={!onChange}
                        placeholder={blank.hint || ''}
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
            if (next.has(optId)) next.delete(optId); else next.add(optId)
            onChange(Array.from(next))
        } else {
            onChange(optId)
        }
    }
    return (
        <div>
            <p style={{ fontWeight: 600, marginBottom: 8 }}><InlineMathText text={question} /></p>
            <ul className="mc-list">
                {options.map((opt) => {
                    const isSelected = selected.has(opt.id)
                    const isCorrect = opt.correct
                    const showCorrectness = showAnswers
                    return (
                        <li key={opt.id} className={showCorrectness && isCorrect ? 'correct' : ''}>
                            <input
                                type={multiple ? 'checkbox' : 'radio'}
                                name={groupId}
                                checked={isSelected}
                                onChange={() => toggle(opt.id)}
                                disabled={!onChange}
                                style={{ marginTop: 4, flexShrink: 0 }}
                            />
                            <label style={{ flex: 1 }}>
                                <InlineMathText text={opt.text} />
                                {showCorrectness && isCorrect && <strong style={{ marginLeft: 8 }}>✓</strong>}
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
        <div style={{ margin: '12px 0' }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}><InlineMathText text={question} /></p>
            {rows === 1 ? (
                <input
                    type="text"
                    value={value ?? ''}
                    onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                    readOnly={!onChange}
                />
            ) : (
                <textarea
                    value={value ?? ''}
                    onChange={onChange ? (e) => onChange(e.target.value) : undefined}
                    readOnly={!onChange}
                    rows={rows}
                />
            )}
            {showAnswers && expectedAnswer && (
                <div style={{
                    marginTop: 8,
                    fontSize: 13,
                    background: '#ecfdf5',
                    color: '#065f46',
                    padding: '8px 12px',
                    borderRadius: 6,
                }}>
                    <strong>Ожидаемый ответ:</strong> <InlineMathText text={expectedAnswer} />
                </div>
            )}
        </div>
    )
}

export function Matching({
    instruction, left, right, pairs, showAnswers,
}: {
    instruction: string
    left: { id: string; text: string }[]
    right: { id: string; text: string }[]
    pairs: [string, string][]
} & InteractiveProps) {
    return (
        <div style={{ margin: '12px 0' }}>
            <p style={{ fontWeight: 600, marginBottom: 12 }}><InlineMathText text={instruction} /></p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {left.map((l) => (
                        <li key={l.id} style={{ padding: '6px 0', display: 'flex', gap: 8 }}>
                            <strong style={{ color: '#6b7280', minWidth: 24 }}>{l.id}.</strong>
                            <span><InlineMathText text={l.text} /></span>
                        </li>
                    ))}
                </ol>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {right.map((r) => (
                        <li key={r.id} style={{ padding: '6px 0', display: 'flex', gap: 8 }}>
                            <strong style={{ color: '#6b7280', minWidth: 24 }}>{r.id}.</strong>
                            <span><InlineMathText text={r.text} /></span>
                        </li>
                    ))}
                </ol>
            </div>
            {showAnswers && pairs.length > 0 && (
                <div style={{
                    marginTop: 12,
                    fontSize: 13,
                    background: '#ecfdf5',
                    color: '#065f46',
                    padding: '8px 12px',
                    borderRadius: 6,
                }}>
                    <strong>Соответствия:</strong>{' '}
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
    const safe = html.replace(/<script[\s\S]*?<\/script>/gi, '')
    return <div dangerouslySetInnerHTML={{ __html: safe }} />
}

export { MathDisplay }

// ───────── BlockRenderer (главный switch) ─────────

export interface BlockRendererProps {
    block: Block
    answers?: Record<string, any>
    onAnswerChange?: (blockId: string, value: any) => void
    showAnswers?: boolean
}

export function BlockRenderer({ block, answers, onAnswerChange, showAnswers }: BlockRendererProps) {
    switch (block.type) {
        case 'heading': return <Heading level={block.level} text={block.text} />
        case 'paragraph': return <Paragraph text={block.text} />
        case 'callout': return <Callout variant={block.variant} title={block.title} text={block.text} />
        case 'spacer': return <Spacer size={block.size} />
        case 'math-display': return (
            <div className="math-display">
                <MathDisplay latex={block.latex} caption={block.caption} />
            </div>
        )
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
