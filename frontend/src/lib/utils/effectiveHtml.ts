/**
 * Зеркало `backend/src/common/utils/effective-html.util.ts`.
 *
 * outputData.content    — оригинальный HTML от AI (head с дизайн-системой,
 *                         MathJax, page-break-rules). НЕ перезаписывается.
 * outputData.editedBody — body innerHTML после правки в редакторе. Если
 *                         задан — подставляется внутрь оригинального <body>.
 *
 * Любой код, который собирается рендерить материал (превью, выдача ученикам,
 * проверка ДЗ), должен сначала прогнать outputData через эту функцию —
 * тогда правки видны, а каноническая шапка/стили остаются.
 */
export function getEffectiveHtml(outputData: any): string {
    if (!outputData) return ''

    const rawContent =
        outputData?.content ??
        outputData?.htmlResult ??
        outputData?.html ??
        outputData?.text ??
        ''
    const original = typeof rawContent === 'string' ? rawContent : ''
    const editedBody = outputData?.editedBody

    if (!editedBody || typeof editedBody !== 'string' || !editedBody.trim()) {
        return original
    }

    const bodyMatch = original.match(/<body([^>]*)>[\s\S]*?<\/body>/i)
    if (bodyMatch) {
        return original.replace(
            /<body([^>]*)>[\s\S]*?<\/body>/i,
            `<body$1>${editedBody}</body>`,
        )
    }
    return editedBody
}
