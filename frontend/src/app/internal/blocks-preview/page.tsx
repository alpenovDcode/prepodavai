'use client'

import { useState } from 'react'
import { DocumentRenderer } from '@/components/blocks/DocumentRenderer'
import { DocumentEditor } from '@/components/blocks/editor/DocumentEditor'
import { stereometryWorksheet } from '@/lib/blocks/fixtures/worksheet-stereometry'
import { GenerationDocument } from '@/lib/blocks/schema'

/**
 * Dev-страница для разработки нового JSON-формата генераций.
 * Никакого AI, никакой БД — только фикстуры → DocumentRenderer.
 * URL: /internal/blocks-preview
 *
 * Три режима в табах:
 *   • Превью (учитель смотрит на материал)
 *   • С ответами (учитель смотрит ключ ответов)
 *   • Заполнение (ученик заполняет ответы — управляемые поля)
 */

type Mode = 'preview' | 'answers' | 'fill' | 'edit'

const FIXTURES: { id: string; label: string; doc: GenerationDocument }[] = [
    { id: 'stereometry', label: 'Стереометрия (worksheet)', doc: stereometryWorksheet },
]

export default function BlocksPreviewPage() {
    const [fixtureId, setFixtureId] = useState(FIXTURES[0].id)
    const [mode, setMode] = useState<Mode>('preview')
    const [answers, setAnswers] = useState<Record<string, any>>({})
    const [editedDoc, setEditedDoc] = useState<GenerationDocument | null>(null)

    const baseDoc = FIXTURES.find(f => f.id === fixtureId)!.doc
    const doc = editedDoc || baseDoc
    const showAnswers = mode === 'answers'
    const onAnswerChange = mode === 'fill' ? (id: string, v: any) => setAnswers(s => ({ ...s, [id]: v })) : undefined

    // Валидируем фикстуру при первом рендере — чтобы быстро словить mistake в schema.
    let validationError: string | null = null
    try {
        // Импорт лениво, чтобы не утащить zod в бандл прод-страниц.
        const { GenerationDocument: Schema } = require('@/lib/blocks/schema')
        Schema.parse(doc)
    } catch (e: any) {
        validationError = e?.message || String(e)
    }

    return (
        <div className="min-h-screen bg-ink-50 p-6 max-md:p-3">
            {/* Контролы (dev only) */}
            <div className="max-w-[840px] mx-auto mb-5 bg-white rounded-lg border border-ink-200 p-4 print:hidden">
                <div className="text-[12px] uppercase font-bold text-ink-500 tracking-wider mb-3">Dev preview · /internal/blocks-preview</div>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="text-[13px] text-ink-700">
                        Фикстура:&nbsp;
                        <select
                            value={fixtureId}
                            onChange={(e) => { setFixtureId(e.target.value); setAnswers({}) }}
                            className="px-2 py-1 border border-ink-200 rounded-md text-[13px]"
                        >
                            {FIXTURES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                        </select>
                    </label>
                    <div className="flex items-center gap-1.5 ml-auto">
                        {(['preview', 'answers', 'fill', 'edit'] as Mode[]).map(m => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMode(m)}
                                className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                                    mode === m
                                        ? 'bg-brand-500 text-white'
                                        : 'bg-ink-50 text-ink-700 hover:bg-ink-100'
                                }`}
                            >
                                {m === 'preview' ? 'Превью' : m === 'answers' ? 'С ответами' : m === 'fill' ? 'Заполнение' : 'Редактирование'}
                            </button>
                        ))}
                    </div>
                </div>
                {validationError && (
                    <div className="mt-3 text-[13px] text-danger-700 bg-danger-50 border border-danger-200 rounded-md p-3">
                        <div className="font-semibold mb-1">Schema-ошибка в фикстуре:</div>
                        <pre className="whitespace-pre-wrap text-[12px]">{validationError}</pre>
                    </div>
                )}
                {mode === 'fill' && Object.keys(answers).length > 0 && (
                    <div className="mt-3 text-[12px] text-ink-600 bg-ink-50 rounded-md p-2.5">
                        <span className="font-semibold">Ответы ученика (JSON, для отладки сабмита):</span>
                        <pre className="mt-1 max-h-[120px] overflow-auto">{JSON.stringify(answers, null, 2)}</pre>
                    </div>
                )}
            </div>

            {mode === 'edit' ? (
                <DocumentEditor
                    initialDoc={doc}
                    onSave={async (next) => { setEditedDoc(next); setMode('preview') }}
                    onCancel={() => setMode('preview')}
                />
            ) : (
                <DocumentRenderer
                    doc={doc}
                    answers={mode === 'fill' ? answers : undefined}
                    onAnswerChange={onAnswerChange}
                    showAnswers={showAnswers}
                />
            )}
        </div>
    )
}
