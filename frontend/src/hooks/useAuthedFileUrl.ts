'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api/client'

/**
 * Подгружает файл с авторизацией (через apiClient/cookies) и возвращает
 * blob URL для безопасного использования в <iframe>/<img>.
 *
 * Зачем: backend ставит `X-Frame-Options: SAMEORIGIN` (через helmet) и
 * фронт живёт на другом субдомене (prepodavai.ru vs api.prepodavai.ru) —
 * браузер блокирует прямой `<iframe src={fileUrl}>`. Blob URL рендерится
 * с blob: origin, не попадает под X-Frame-Options, всегда работает.
 *
 * @param url абсолютный URL backend-файла (или null чтобы пропустить)
 * @returns { blobUrl, loading, error } — blobUrl null пока грузим
 */
export function useAuthedFileUrl(url: string | null | undefined): {
    blobUrl: string | null
    loading: boolean
    error: string | null
} {
    const [blobUrl, setBlobUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!url) {
            setBlobUrl(null)
            setError(null)
            setLoading(false)
            return
        }
        let cancelled = false
        let createdUrl: string | null = null
        setLoading(true)
        setError(null)
        // apiClient уже шлёт credentials + Authorization. Делаем raw axios-style
        // запрос через apiClient — он подхватит auth-куки.
        apiClient
            .get(url, { responseType: 'blob', baseURL: undefined as any })
            .then(res => {
                if (cancelled) return
                createdUrl = URL.createObjectURL(res.data as Blob)
                setBlobUrl(createdUrl)
            })
            .catch(e => {
                if (cancelled) return
                setError(e?.message || 'Не удалось загрузить файл')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
            if (createdUrl) URL.revokeObjectURL(createdUrl)
        }
    }, [url])

    return { blobUrl, loading, error }
}
