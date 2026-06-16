'use client'

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Рендер LaTeX через KaTeX (синхронно, без MathJax).
 * Используется как display-блок (`<MathDisplay />`) и как inline-парсер
 * для текста с `$…$` (`<InlineMathText />`).
 */

export function MathDisplay({ latex, caption }: { latex: string; caption?: string }) {
    const html = useMemo(() => {
        try {
            return katex.renderToString(latex, { displayMode: true, throwOnError: false })
        } catch {
            return `<code>${escapeHtml(latex)}</code>`
        }
    }, [latex])
    return (
        <figure className="my-4">
            <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
            {caption && <figcaption className="text-center text-sm text-ink-500 mt-1.5">{caption}</figcaption>}
        </figure>
    )
}

/**
 * Inline-математика внутри произвольного текста.
 * Поддерживаемая нотация: `$…$` (inline) и `$$…$$` (display) внутри одного абзаца.
 *
 * Перед разбором делаем эвристический auto-wrap: если в тексте есть
 * plain-text математика (sqrt(x), 1/2, a^2) БЕЗ обрамления $...$ — оборачиваем.
 * Это страховка на случай если AI забыл следовать промпт-правилу.
 */
export function InlineMathText({ text }: { text: string }) {
    const parts = useMemo(() => splitMath(autowrapPlainMath(text)), [text])
    return (
        <>
            {parts.map((part, i) => {
                if (part.kind === 'text') return <span key={i}>{part.value}</span>
                try {
                    const html = katex.renderToString(part.value, {
                        displayMode: part.kind === 'display',
                        throwOnError: false,
                    })
                    return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
                } catch {
                    return <code key={i}>{part.value}</code>
                }
            })}
        </>
    )
}

type Token = { kind: 'text' | 'inline' | 'display'; value: string }

function splitMath(text: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    let buf = ''
    while (i < text.length) {
        // display: $$…$$
        if (text[i] === '$' && text[i + 1] === '$') {
            const end = text.indexOf('$$', i + 2)
            if (end !== -1) {
                if (buf) { tokens.push({ kind: 'text', value: buf }); buf = '' }
                tokens.push({ kind: 'display', value: text.slice(i + 2, end) })
                i = end + 2
                continue
            }
        }
        // inline: $…$
        if (text[i] === '$') {
            const end = text.indexOf('$', i + 1)
            if (end !== -1) {
                if (buf) { tokens.push({ kind: 'text', value: buf }); buf = '' }
                tokens.push({ kind: 'inline', value: text.slice(i + 1, end) })
                i = end + 1
                continue
            }
            // Незакрытый `$` — это бракованный шаблон от AI (fill-blank с
            // {{N}} внутри формулы рвёт пару). Чтобы не показывать сырой
            // LaTeX-код, просто дропаем висячий `$` и продолжаем как текст.
            i++
            continue
        }
        buf += text[i]
        i++
    }
    if (buf) tokens.push({ kind: 'text', value: buf })
    return tokens
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/**
 * Эвристически оборачивает plain-text математику в $...$ если AI её не обернул.
 * Идентично backend/json-to-html.ts — синхронизируем при правках.
 *
 * Только частые однозначные паттерны:
 *   sqrt(N)   → $\sqrt{N}$
 *   1/2       → $\frac{1}{2}$
 *   a^2       → $a^{2}$
 *
 * Внутри уже существующих $...$ не трогаем — выделяем не-math сегменты и
 * применяем замены только к ним.
 */
function autowrapPlainMath(text: string): string {
    // Сначала вырежем math-сегменты, применим трансформации только к non-math.
    const segments: Array<{ kind: 'text' | 'math'; value: string }> = []
    let i = 0
    let buf = ''
    while (i < text.length) {
        if (text[i] === '$' && text[i + 1] === '$') {
            const end = text.indexOf('$$', i + 2)
            if (end !== -1) {
                if (buf) { segments.push({ kind: 'text', value: buf }); buf = '' }
                segments.push({ kind: 'math', value: text.slice(i, end + 2) })
                i = end + 2
                continue
            }
        }
        if (text[i] === '$') {
            const end = text.indexOf('$', i + 1)
            if (end !== -1) {
                if (buf) { segments.push({ kind: 'text', value: buf }); buf = '' }
                segments.push({ kind: 'math', value: text.slice(i, end + 1) })
                i = end + 1
                continue
            }
        }
        buf += text[i]
        i++
    }
    if (buf) segments.push({ kind: 'text', value: buf })

    return segments
        .map(seg => seg.kind === 'math' ? seg.value : transformPlainSegment(seg.value))
        .join('')
}

function transformPlainSegment(s: string): string {
    let out = s
    out = out.replace(/\bsqrt\s*\(\s*([^()]+?)\s*\)/g, (_, body) => `$\\sqrt{${body}}$`)
    out = out.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_, a, b) => `$\\frac{${a}}{${b}}$`)
    out = out.replace(/\b([a-zA-Z])\^(\d+)\b/g, (_, base, exp) => `$${base}^{${exp}}$`)
    // Соседние $..$$..$ объединить в один с \cdot.
    out = out.replace(/\$([^$]+)\$\s*\$([^$]+)\$/g, (_, a, b) => `$${a} \\cdot ${b}$`)
    return out
}
