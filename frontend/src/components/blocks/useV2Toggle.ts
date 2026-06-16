'use client'

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/api/client'
import { JSON_BLOCKS_FORMAT } from '@/lib/blocks/schema'
import type { GenerationDocument } from '@/lib/blocks/schema'

/**
 * Хук для интеграции чекбокса «Новый формат (бета)» в любой V2-генератор.
 *
 * Возвращает state и handlers:
 *   - useV2 (включён ли новый формат, перс'd в localStorage)
 *   - toggleV2(boolean)
 *   - v2Doc / v2GenerationId / v2IsGenerating / v2IsSaving / v2Mode
 *   - generateV2(endpoint, params) — POST к v2-эндпоинту, на ответ кладёт doc
 *   - saveV2(updatedDoc) — PATCH /generate/:id с новым outputDoc
 *
 * Каждый генератор (worksheet/quiz/lesson-plan/vocabulary/lesson-preparation)
 * передаёт свой endpoint и params. Логика рендера и редактирования —
 * та же DocumentRenderer/DocumentEditor.
 */
export function useV2Toggle(storageKey: string) {
    // По умолчанию ВКЛЮЧЁН (JSON-blocks — основной формат генерации).
    // Если пользователь явно выставил '0' в localStorage (например, через
    // отладку) — уважаем выбор; иначе всегда true.
    const [useV2, setUseV2] = useState<boolean>(() => {
        if (typeof window === 'undefined') return true
        try {
            const v = localStorage.getItem(storageKey)
            return v === null ? true : v !== '0'
        } catch { return true }
    })
    const [v2Doc, setV2Doc] = useState<GenerationDocument | null>(null)
    const [v2GenerationId, setV2GenerationId] = useState<string | null>(null)
    const [v2IsGenerating, setV2IsGenerating] = useState(false)
    const [v2IsSaving, setV2IsSaving] = useState(false)
    const [v2Mode, setV2Mode] = useState<'preview' | 'answers' | 'edit'>('preview')

    const toggleV2 = useCallback((next: boolean) => {
        setUseV2(next)
        try { localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
    }, [storageKey])

    const generateV2 = useCallback(async (endpoint: string, params: Record<string, any>) => {
        setV2IsGenerating(true)
        setV2Doc(null)
        setV2GenerationId(null)
        setV2Mode('preview')
        try {
            const res = await apiClient.post(endpoint, params)
            const data = res.data
            if (!data?.outputDoc) {
                toast.error('Ответ AI не содержит документа')
                return
            }
            setV2Doc(data.outputDoc)
            setV2GenerationId(data.generationId)
            toast.success('Сгенерировано')
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || 'Не удалось сгенерировать'
            toast.error(Array.isArray(msg) ? msg.join('; ') : msg)
        } finally {
            setV2IsGenerating(false)
        }
    }, [])

    const saveV2 = useCallback(async (next: GenerationDocument) => {
        if (!v2GenerationId) return
        setV2IsSaving(true)
        try {
            await apiClient.patch(`/generate/${v2GenerationId}`, {
                outputData: { format: JSON_BLOCKS_FORMAT, outputDoc: next },
            })
            setV2Doc(next)
            toast.success('Сохранено')
            setV2Mode('preview')
        } catch (e: any) {
            const msg = e?.response?.data?.message || e?.message || 'Не удалось сохранить'
            toast.error(Array.isArray(msg) ? msg.join('; ') : msg)
        } finally {
            setV2IsSaving(false)
        }
    }, [v2GenerationId])

    return {
        useV2, toggleV2,
        v2Doc, setV2Doc,
        v2GenerationId,
        v2IsGenerating,
        v2IsSaving,
        v2Mode, setV2Mode,
        generateV2,
        saveV2,
        hasV2Result: !!v2Doc && !v2IsGenerating,
    }
}
