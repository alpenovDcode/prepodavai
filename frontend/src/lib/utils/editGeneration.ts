import { apiClient } from '@/lib/api/client'

/**
 * Контракт «варианта A» для редактирования сгенерированных материалов.
 *
 * outputData в БД содержит:
 *   - `content`     — ОРИГИНАЛ AI-HTML с полной дизайн-системой (CSS, MathJax,
 *                     `@media print`, `page-break-before`, размеры лого
 *                     с `!important`). НЕ перезаписывается редактором.
 *   - `editedBody`  — body innerHTML после правок (только содержимое тела,
 *                     с восстановленным LaTeX и нормализованными полями).
 *
 * При рендере PDF/DOCX/превью бэк (и фронт) собирают эффективный HTML через
 * `getEffectiveHtml`: оригинал из `content` + подмена `<body>` на `editedBody`,
 * если он есть. Дизайн остаётся каноническим даже после правок.
 *
 * Этот файл — общий код для всех V2-генераторов, чтобы поведение save было
 * единообразным.
 */

/**
 * Превращает редактируемый <body> iframe в строку для `editedBody`:
 *   1. Восстанавливает исходный LaTeX из `<mjx-container data-original-input>`.
 *      Атрибут проставляется скриптом MATHJAX_STAMP_SCRIPT (см. ensureMathJax.ts).
 *   2. Чистит остатки MathJax-разметки и contentEditable-обвес.
 *   3. Нормализует `<input>`-поля (восстанавливает `class="inline-input"`).
 *
 * Возвращает trimmed innerHTML или null, если результат пуст по тексту
 * (защита от случайного сохранения «снёс всё»).
 */
export function extractEditedBody(iframeDoc: Document | null | undefined): string | null {
    const body = iframeDoc?.body
    if (!body) return null

    // Работаем с КЛОНОМ, чтобы не задеть DOM, который видит пользователь.
    const clone = body.cloneNode(true) as HTMLElement

    // 1) Восстанавливаем исходный LaTeX из MathJax-контейнеров.
    clone.querySelectorAll('mjx-container').forEach((el) => {
        const orig = el.getAttribute('data-original-input')
        const display = el.getAttribute('data-display') === 'true'
        if (orig) {
            const wrapped = display ? `\\[${orig}\\]` : `\\(${orig}\\)`
            el.replaceWith(iframeDoc!.createTextNode(wrapped))
        } else {
            el.remove()
        }
    })
    // Остатки разметки MathJax.
    clone.querySelectorAll('mjx-assistive-mml, mjx-math, mjx-utility').forEach((el) => el.remove())
    // Скрипты не сохраняем.
    clone.querySelectorAll('script').forEach((el) => el.remove())
    // contentEditable-обвес.
    clone.removeAttribute('contenteditable')
    clone.style.outline = ''
    clone.style.outlineOffset = ''

    // 2) Нормализуем поля ввода: после правки браузер мог нагрузить им
    //    inline-style и потерять class="inline-input". Восстанавливаем
    //    канонический вид — иначе в PDF подчёркивание превратится в рамку.
    clone.querySelectorAll('input').forEach((el) => {
        const inp = el as HTMLInputElement
        const type = (inp.getAttribute('type') || 'text').toLowerCase()
        if (type !== 'text' && type !== '') return
        // Если есть border-bottom в стилях — это inline-поле.
        const styleHasBorderBottom = (inp.getAttribute('style') || '').includes('border-bottom')
        if (styleHasBorderBottom && !inp.classList.contains('inline-input')) {
            inp.classList.add('inline-input')
        }
        // Чистим временные атрибуты браузера.
        inp.removeAttribute('value')
    })

    const editedBody = clone.innerHTML.trim()
    const plain = editedBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim()
    if (!plain) return null
    return editedBody
}

/**
 * PATCH /generate/:id с edited body. Оригинал в `content` не трогается —
 * `updateGeneration` shallow-мерджит `outputData`, так что `editedBody`
 * ляжет рядом с `content`. Сброс правок (`/reset-edits`) обнулит `editedBody`.
 */
export async function saveGenerationEdits(
    generationId: string,
    editedBody: string,
): Promise<void> {
    await apiClient.patch(`/generate/${generationId}`, {
        outputData: { editedBody },
    })
}
