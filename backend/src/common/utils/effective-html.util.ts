/**
 * «Эффективный» HTML генерации = оригинал AI-HTML с заменённым `<body>`,
 * если пользователь правил материал в редакторе.
 *
 * Контракт outputData (для HTML-генераций — worksheet / quiz / lesson_plan /
 * vocabulary / exam-variant и т.п.):
 *   - `content`     — оригинальный HTML, который вернул AI. НЕ перезаписываем.
 *   - `editedBody`  — body innerHTML после правок в редакторе (только тело,
 *                     без `<html>`/`<head>`/`<style>`). Если есть — при
 *                     рендере PDF/DOCX/превью подкладываем его внутрь
 *                     оригинального `<body>` оригинального HTML.
 *
 * Зачем так:
 *   1. Дизайн-система (`DesignSystemConfig.STYLES`), `@media print`, размеры
 *      лого с `!important`, `page-break-before` у блока ответов — всё это
 *      сидит в `<head>` оригинала. Сохраняя его и подменяя только body,
 *      мы гарантируем, что PDF после правки выглядит как PDF до правки.
 *   2. Откат правок = обнуление `editedBody` (или просто игнор), без потери
 *      оригинала.
 */
export function getEffectiveHtml(outputData: any): string {
  if (!outputData) return '';

  const rawContent =
    outputData?.content ??
    outputData?.htmlResult ??
    outputData?.html ??
    outputData?.text ??
    '';
  const original = typeof rawContent === 'string' ? rawContent : '';
  const editedBody = outputData?.editedBody;

  if (!editedBody || typeof editedBody !== 'string' || !editedBody.trim()) {
    return original;
  }

  // Если в оригинале есть полноценный `<body>…</body>` — подменяем содержимое.
  // Атрибуты `<body …>` оригинала сохраняем.
  const bodyMatch = original.match(/<body([^>]*)>[\s\S]*?<\/body>/i);
  if (bodyMatch) {
    return original.replace(
      /<body([^>]*)>[\s\S]*?<\/body>/i,
      `<body$1>${editedBody}</body>`,
    );
  }

  // Запасной случай: оригинала нет / битый. Тогда просто отдаём editedBody
  // как минимальный документ. PDF-конвертер при необходимости его обернёт.
  return editedBody;
}
