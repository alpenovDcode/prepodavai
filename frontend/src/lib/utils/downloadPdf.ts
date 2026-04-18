import DOMPurify from 'isomorphic-dompurify'
import { apiClient } from '@/lib/api/client'

export async function downloadPdf(html: string, filename = 'document.pdf'): Promise<void> {
    const safeHtml = DOMPurify.sanitize(html, { FORCE_BODY: true })
    const fullHtml = /<\/head>/i.test(safeHtml)
        ? safeHtml
        : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${safeHtml}</body></html>`

    const response = await apiClient.post('/generate/export-pdf', { html: fullHtml }, { responseType: 'blob' })

    const url = URL.createObjectURL(response.data)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}
