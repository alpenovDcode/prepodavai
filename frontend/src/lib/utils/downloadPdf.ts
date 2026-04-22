import { apiClient } from '@/lib/api/client'

/**
 * Скачивает PDF по id генерации — бекенд сам читает `outputData` из БД и
 * рендерит через тот же `htmlToPdf`, что и Telegram/MAX-сендеры. Это
 * гарантирует, что веб-PDF 1-в-1 совпадает с тем, что приходит в чат.
 *
 * `id` — это `generationRequestId` (из `useGenerations().activeGenerationId`)
 * либо `userGeneration.id` (из сохранённых материалов). Бекенд принимает оба.
 */
export async function downloadPdfById(id: string, filename = 'document.pdf'): Promise<void> {
    if (!id) throw new Error('generation id is required')

    const response = await apiClient.post(
        `/generate/${encodeURIComponent(id)}/pdf`,
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
