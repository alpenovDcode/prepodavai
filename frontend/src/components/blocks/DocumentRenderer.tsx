'use client'

import { BlockRenderer } from './Blocks'
import type { GenerationDocument } from '@/lib/blocks/schema'
import { LOGO_BASE64 } from '@/constants/branding'

/**
 * Главный рендерер документа в формате blocks-v1.
 *
 * Визуально 1-в-1 с старым HTML-форматом (IFRAME_BASE_STYLES в
 * MaterialViewerV2 / design-system.config.ts на бэке): белая карточка
 * с тенью, Inter, лого 40×40 в шапке, серый фон страницы, та же
 * палитра / отступы / типографика.
 *
 * Стили scoped через корневой класс `.prepodavai-doc` чтобы не утекали
 * на остальную страницу (не задевали Tailwind-классы дашборда).
 *
 * Используется в трёх местах:
 *   1) Превью у учителя (read-only).
 *   2) Заполнение учеником (onAnswerChange управляет полями).
 *   3) Просмотр проверенного ДЗ (answers + showAnswers).
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
        <div className={`prepodavai-doc-wrapper ${className || ''}`}>
            <DocumentStyles />
            <div className="prepodavai-doc">
                <div className="container">
                    <DocumentHeader doc={doc} />
                    <DocumentMeta doc={doc} />
                    {doc.blocks.map((block) => (
                        <BlockRenderer
                            key={block.id}
                            block={block}
                            answers={answers}
                            onAnswerChange={onAnswerChange}
                            showAnswers={showAnswers}
                        />
                    ))}
                    <DocumentFooter />
                </div>
            </div>
        </div>
    )
}

function DocumentHeader({ doc }: { doc: GenerationDocument }) {
    return (
        <div className="header">
            <img className="header-logo" src={LOGO_BASE64} alt="" />
            <h1>{doc.title}</h1>
        </div>
    )
}

function DocumentMeta({ doc }: { doc: GenerationDocument }) {
    const meta = doc.meta || {}
    const pairs: Array<[string, string]> = []
    if (meta.subject) pairs.push(['Предмет', meta.subject])
    if (meta.grade) pairs.push(['Класс', meta.grade])
    if (meta.duration) pairs.push(['Длительность', meta.duration])
    if (meta.studentName) pairs.push(['Ученик', meta.studentName])
    if (meta.date) pairs.push(['Дата', meta.date])
    if (pairs.length === 0) return null
    return (
        <div className="meta-info">
            {pairs.map(([k, v]) => (
                <span key={k} className="meta-info-item">
                    <strong>{k}:</strong> {v}
                </span>
            ))}
        </div>
    )
}

function DocumentFooter() {
    return (
        <div className="footer-logo">
            <img src={LOGO_BASE64} alt="" />
        </div>
    )
}

/**
 * Канонический CSS дизайн-системы. Идентичен IFRAME_BASE_STYLES в
 * MaterialViewerV2.tsx и DesignSystemConfig.STYLES на бэке. Если что-то
 * меняется здесь — синхронно меняем во всех трёх местах.
 *
 * Scope: всё внутри `.prepodavai-doc`. Сам wrapper — `.prepodavai-doc-wrapper` —
 * имеет серый фон страницы (как body иммитирует), чтобы белая `.container`
 * выглядела карточкой на сером.
 */
function DocumentStyles() {
    return (
        <style jsx global>{`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

            .prepodavai-doc-wrapper {
                background: #f9fafb;
                padding: 20px;
                min-height: 100%;
            }
            .prepodavai-doc *,
            .prepodavai-doc *::before,
            .prepodavai-doc *::after {
                box-sizing: border-box;
            }
            .prepodavai-doc {
                font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #111827;
                line-height: 1.6;
            }
            .prepodavai-doc .container {
                max-width: 100%;
                width: 100%;
                margin: 0 auto;
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            }
            .prepodavai-doc .header {
                display: flex;
                align-items: center;
                gap: 20px;
                margin-bottom: 30px;
                border-bottom: 2px solid #f3f4f6;
                padding-bottom: 20px;
            }
            .prepodavai-doc .header-logo {
                width: 40px;
                height: 40px;
                object-fit: contain;
                flex-shrink: 0;
            }
            .prepodavai-doc h1 {
                font-size: 28px;
                font-weight: 700;
                margin: 0;
                color: #111827;
                line-height: 1.2;
            }
            .prepodavai-doc h2 {
                font-size: 20px;
                font-weight: 600;
                margin-top: 32px;
                margin-bottom: 16px;
                color: #374151;
            }
            .prepodavai-doc h3 {
                font-size: 17px;
                font-weight: 600;
                margin-top: 24px;
                margin-bottom: 12px;
                color: #374151;
            }
            .prepodavai-doc p {
                margin: 0 0 16px;
                font-size: 15px;
                color: #111827;
            }
            .prepodavai-doc ul,
            .prepodavai-doc ol {
                padding-left: 24px;
                margin: 0 0 20px;
            }
            .prepodavai-doc li {
                margin-bottom: 8px;
            }
            .prepodavai-doc input[type="text"],
            .prepodavai-doc textarea {
                width: 100%;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                padding: 8px 12px;
                font-family: inherit;
                font-size: inherit;
                background: white;
                transition: border-color 0.2s;
            }
            .prepodavai-doc input[type="text"]:focus,
            .prepodavai-doc textarea:focus {
                outline: none;
                border-color: #4f46e5;
            }
            .prepodavai-doc .inline-input {
                display: inline-block;
                width: 150px;
                border: none;
                border-bottom: 1px solid #9ca3af;
                border-radius: 0;
                padding: 0 4px;
                background: transparent;
                font-family: inherit;
                font-size: inherit;
                color: #111827;
            }
            .prepodavai-doc .inline-input:focus {
                outline: none;
                border-bottom-color: #4f46e5;
            }
            .prepodavai-doc .meta-info {
                margin-bottom: 30px;
                background: #fafafa;
                padding: 15px;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                display: flex;
                flex-wrap: wrap;
                gap: 8px 24px;
                font-size: 14px;
                color: #6b7280;
            }
            .prepodavai-doc .meta-info-item strong {
                color: #374151;
                font-weight: 600;
                margin-right: 4px;
            }
            .prepodavai-doc table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                margin-bottom: 20px;
                font-size: 14px;
            }
            .prepodavai-doc th {
                background-color: #f9fafb;
                font-weight: 600;
                text-align: left;
                padding: 12px;
                border: 1px solid #d1d5db;
            }
            .prepodavai-doc td {
                padding: 12px;
                border: 1px solid #e5e7eb;
                vertical-align: top;
            }
            .prepodavai-doc .callout {
                background: #f0f9ff;
                border-left: 4px solid #0ea5e9;
                padding: 16px;
                margin: 20px 0;
                border-radius: 0 8px 8px 0;
            }
            .prepodavai-doc .callout.callout-warning {
                background: #fffbeb;
                border-left-color: #f59e0b;
            }
            .prepodavai-doc .callout.callout-success {
                background: #ecfdf5;
                border-left-color: #10b981;
            }
            .prepodavai-doc .callout.callout-tip {
                background: #f5f3ff;
                border-left-color: #8b5cf6;
            }
            .prepodavai-doc .callout.callout-methodology {
                background: #f9fafb;
                border-left-color: #6b7280;
            }
            .prepodavai-doc .callout-title {
                font-weight: 700;
                margin-bottom: 6px;
            }
            .prepodavai-doc .footer-logo {
                text-align: right;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #f3f4f6;
            }
            .prepodavai-doc .footer-logo img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                opacity: 0.5;
                display: inline-block;
            }
            .prepodavai-doc .teacher-answers-only {
                margin-top: 40px;
                padding-top: 20px;
                border-top: 2px dashed #d1d5db;
            }
            .prepodavai-doc .teacher-answers-only h2 {
                color: #dc2626;
            }
            .prepodavai-doc .answer-chip {
                display: inline-block;
                padding: 2px 8px;
                margin: 0 2px;
                border-radius: 4px;
                background: #d1fae5;
                color: #065f46;
                font-weight: 600;
            }
            .prepodavai-doc .mc-list {
                list-style: none;
                padding: 0;
                margin: 8px 0 20px;
            }
            .prepodavai-doc .mc-list li {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 4px 8px;
                border-radius: 6px;
                margin-bottom: 4px;
            }
            .prepodavai-doc .mc-list li.correct {
                background: #ecfdf5;
                color: #065f46;
            }
            .prepodavai-doc figure {
                margin: 16px 0;
            }
            .prepodavai-doc figcaption {
                text-align: center;
                font-size: 13px;
                color: #6b7280;
                margin-top: 6px;
            }
            .prepodavai-doc .math-display {
                margin: 16px 0;
                text-align: center;
            }
            @media (max-width: 640px) {
                .prepodavai-doc-wrapper { padding: 12px; }
                .prepodavai-doc .container { padding: 20px; }
                .prepodavai-doc h1 { font-size: 24px; }
                .prepodavai-doc h2 { font-size: 18px; }
            }
            @media print {
                .prepodavai-doc-wrapper { background: white; padding: 0; }
                .prepodavai-doc .container { box-shadow: none; border-radius: 0; padding: 0; }
            }
        `}</style>
    )
}
