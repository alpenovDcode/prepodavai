import { apiClient } from '@/lib/api/client'

/**
 * Скачивает PDF по id генерации — бекенд сам читает `outputData` из БД и
 * рендерит через тот же `htmlToPdf`, что и Telegram/MAX-сендеры. Это
 * гарантирует, что веб-PDF 1-в-1 совпадает с тем, что приходит в чат.
 *
 * `id` — это `generationRequestId` (из `useGenerations().activeGenerationId`)
 * либо `userGeneration.id` (из сохранённых материалов). Бекенд принимает оба.
 */
export interface DownloadPdfOptions {
    /**
     * Если `false` — бэкенд вырежет блок «для учителя» (ключ ответов)
     * перед рендером. По умолчанию `true` — PDF со всеми ответами.
     */
    withAnswers?: boolean
    /**
     * Для генераций с несколькими разделами (Вау-урок): индекс раздела
     * в `outputData.sections[]`, который надо отрендерить. Если не задан —
     * рендерится весь документ (склейка всех секций).
     */
    sectionIndex?: number
}

export async function downloadPdfById(
    id: string,
    filename = 'document.pdf',
    options: DownloadPdfOptions = {},
): Promise<void> {
    if (!id) throw new Error('generation id is required')

    const params = new URLSearchParams()
    if (options.withAnswers === false) params.set('withAnswers', 'false')
    if (typeof options.sectionIndex === 'number') {
        params.set('sectionIndex', String(options.sectionIndex))
    }
    const query = params.toString() ? `?${params.toString()}` : ''

    const response = await apiClient.post(
        `/generate/${encodeURIComponent(id)}/pdf${query}`,
        {},
        { responseType: 'blob' },
    )

    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}
