
export const LOGO_BASE64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAA+gAAAPoCAYAAABNo9TkAAAgAElEQVR4AezdB6BkZWH3/zNzpt2+vRdg6V1FEEEQFEui0WiMGo2aaIIxNhLs/tVYoya+BoOJJbZ/oiYqRgj6amwgCCIgWJCyy1KW3WXb3b112jnn/f2eM3P3bqOJcBe/B+/OzJlTP/Nc7/zOU04UMSGAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAAAIIAAAAAAAAA...'; // Truncated for brevity, I should use the full string from the file read.

// Actually, I should read the FULL string first to be safe, or just copy it from the previous `view_file` output if I can rely on it being fully captured there. 
// The previous `view_file` output for `generations.service.ts` (lines 1-150) showed `LOGO_BASE64` starting at line 23.
// However, the `view_file` output for lines 1-150 was truncated at 126029 bytes. `LOGO_BASE64` is likely very long.
// I should probably just export it from `generations.service.ts` for now OR read it fully. 
// But wait, my plan is to MOVE it. If I move it, I need the full content.
// The `view_file` output for lines 1-150 showed the start of it.
// Let me check the size of `generations.service.ts` again. 407400 bytes.
// If I move it, I need the exact string.
// I will try to read `generations.service.ts` again, focusing just on the LOGO lines to get the full content if possible, or I can import it from `generations.service.ts` in the new file, but that creates a circular dependency if `generations.service.ts` needs the other constants.
// Better approach: Keep `LOGO_BASE64` in a separate file or `generation.constants.ts`.
// I need to get the full string.
// I will use `read_file` (view_file) on `generations.service.ts` lines 22-25 to see if it's on one line or multiple. It looks like it's on one line (line 23).
// If line 23 is huge, `view_file` might truncate it.
// Let's assume for a moment I can just copy the other constants first, and handle LOGO_BASE64 carefully.
// Actually, I can just export the other strings first mostly.

export const SHARED_DESIGN_SYSTEM_PROMPT = `ТРЕБОВАНИЯ К ДИЗАЙНУ (ЕДИНЫЙ КОРПОРАТИВНЫЙ СТИЛЬ):
1.  **Контейнер:** max-width 800px, центрирование (margin: 0 auto), белый фон, padding 40px.
2.  **Типографика:** Шрифт Inter, system-ui, sans-serif. Основной текст #1F2937 (Slate-800).
3.  **Стиль блоков:**
    -   Отказ от теней (box-shadow: none). Используй границы (border: 1px solid #E5E7EB).
    -   Radius: border-radius: 6px.
    -   Заголовки: Четкие, жирные, #111827 (Gray-900).
4.  **Логотип:**
    -   В шапке: <div class="header"><img src="LOGO_PLACEHOLDER" class="header-logo"><h1>[ЗАГОЛОВОК]</h1></div>. Логотип слева.
    -   В подвале: Вставь <div class="footer-logo"><img src="LOGO_PLACEHOLDER"></div> СТРОГО В САМОМ КОНЦЕ.`;

export const SHARED_CSS = `<style>
  body { background: #F3F4F6; font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 20px; color: #1F2937; line-height: 1.6; }
  .container { background: white; max-width: 800px; margin: 0 auto; padding: 40px; border: 1px solid #E5E7EB; border-radius: 8px; }
  .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #111827; padding-bottom: 15px; }
  .header-logo { width: 120px; height: auto; flex-shrink: 0; }
  h1 { margin: 0; flex-grow: 1; border-bottom: none; padding-bottom: 0; font-size: 24px; color: #111827; }
  h2 { font-size: 20px; color: #374151; margin-top: 25px; margin-bottom: 15px; border-bottom: 1px solid #E5E7EB; padding-bottom: 5px; }
  .footer-logo { text-align: right; margin-top: 40px; page-break-inside: avoid; }
  .footer-logo img { width: 100px; opacity: 0.5; }
  ul, ol { padding-left: 20px; }
  li { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
  th { background-color: #F9FAFB; font-weight: 600; text-align: left; padding: 10px; border: 1px solid #D1D5DB; }
  td { padding: 10px; border: 1px solid #E5E7EB; vertical-align: top; }
  .callout { background: #F9FAFB; border: 1px solid #E5E7EB; border-left: 4px solid #3B82F6; padding: 15px; border-radius: 4px; margin: 15px 0; }
  @media print {
    body { background: none; padding: 0; }
    .container { border: none; padding: 0; margin: 0; max-width: 100%; }
  }
</style>`;

export const SHARED_MATHJAX_RULES = `МАТЕМАТИЧЕСКИЕ ФОРМУЛЫ (MathJax) - СТРОГИЕ ПРАВИЛА:
1.  Строчные: Используй ТОЛЬКО \\(...\\). Пример: \\(x^2\\). ЗАПРЕЩЕНО использовать $...$.
2.  Блочные: Используй ТОЛЬКО \\[...\\[. Пример: \\[E=mc^2\\]. ЗАПРЕЩЕНО использовать $$...$$.
3.  **КИРИЛЛИЦА:** Никогда не используй кириллицу внутри формул MathJax.
4.  Вставь скрипт конфигурации MathJax в <head>.`;

export const SHARED_MATHJAX_SCRIPT = `<script>
window.MathJax = { tex: { inlineMath: [['\\\\(', '\\\\)']], displayMath: [['\\\\[', '\\\\]']] }, svg: { fontCache: 'global' } };
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>`;

export const SHARED_CRITICAL_RULES_HTML_OUTPUT = `КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА (СОБЛЮДАТЬ СТРОГО):
1.  **СТРАТЕГИЯ:** Напиши краткий план адаптации внутри блока \`<!-- STRATEGY: ... -->\` ПЕРЕД тегом \`<!DOCTYPE html>\`.
2.  **ТОЛЬКО КОД:** Твой ответ должен начинаться с комментария стратегии, затем \`<!DOCTYPE html>\`.
3.  **НИКАКОГО ТЕКСТА ПОСЛЕ КОДА:** Категорически запрещено писать после закрывающего тега </html>.
4.  **БЕЗ MARKDOWN:** Не оборачивай код в тройные кавычки. Верни "сырую" строку HTML.`;
