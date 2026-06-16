'use client'

import { BlockRenderer } from './Blocks'
import type { GenerationDocument } from '@/lib/blocks/schema'

/**
 * Главный рендерер документа в формате blocks-v1.
 * Используется в трёх местах:
 *   1) Превью у учителя (read-only, без onAnswerChange).
 *   2) Заполнение учеником (onAnswerChange сохраняет ответы).
 *   3) Просмотр проверенного ДЗ (answers задано, без onAnswerChange + showAnswers).
 *
 * Никаких iframe: рендерится прямо в DOM. Дизайн-токены — Tailwind.
 * Печать (window.print) контролируется родителем через @media print стили.
 */
export interface DocumentRendererProps {
    doc: GenerationDocument
    answers?: Record<string, any>
    onAnswerChange?: (blockId: string, value: any) => void
    showAnswers?: boolean
    className?: string
}

export function DocumentRenderer({
    doc, answers, onAnswerChange, showAnswers, className,
}: DocumentRendererProps) {
    return (
        <article className={`mx-auto max-w-[840px] bg-white rounded-xl shadow-sm border border-ink-100 p-10 max-md:p-5 ${className || ''}`}>
            <DocumentHeader doc={doc} />
            <div>
                {doc.blocks.map((block) => (
                    <BlockRenderer
                        key={block.id}
                        block={block}
                        answers={answers}
                        onAnswerChange={onAnswerChange}
                        showAnswers={showAnswers}
                    />
                ))}
            </div>
            <DocumentFooter />
        </article>
    )
}

function DocumentHeader({ doc }: { doc: GenerationDocument }) {
    const meta = doc.meta || {}
    const metaPairs: Array<[string, string]> = []
    if (meta.subject) metaPairs.push(['Предмет', meta.subject])
    if (meta.grade) metaPairs.push(['Класс', meta.grade])
    if (meta.duration) metaPairs.push(['Длительность', meta.duration])
    if (meta.studentName) metaPairs.push(['Ученик', meta.studentName])
    if (meta.date) metaPairs.push(['Дата', meta.date])

    return (
        <header className="mb-7 pb-5 border-b-2 border-ink-100">
            <h1 className="font-display font-bold text-[28px] leading-tight text-ink-900 m-0">
                {doc.title}
            </h1>
            {metaPairs.length > 0 && (
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-500">
                    {metaPairs.map(([k, v]) => (
                        <div key={k} className="flex items-baseline gap-1.5">
                            <dt className="font-semibold">{k}:</dt>
                            <dd className="text-ink-700">{v}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </header>
    )
}

function DocumentFooter() {
    return (
        <footer className="mt-10 pt-5 border-t border-ink-100 text-right text-[12px] text-ink-400">
            Преподавай.AI
        </footer>
    )
}
