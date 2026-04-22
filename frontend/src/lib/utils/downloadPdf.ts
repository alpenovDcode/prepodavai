import { apiClient } from '@/lib/api/client'

/**
 * Скачивает PDF через единую backend-ручку `/generate/export-pdf`.
 * Тело отправляется как есть — нормализацию (снятие markdown-обёрток,
 * оборачивание plain-text) делает бекенд тем же способом, что и
 * Telegram/MAX-сендеры, так что PDF из веб-кнопки идентичен мессенджеру.
 */
export async function downloadPdf(html: string, filename = 'document.pdf'): Promise<void> {
    const response = await apiClient.post('/generate/export-pdf', { html }, { responseType: 'blob' })

    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}
