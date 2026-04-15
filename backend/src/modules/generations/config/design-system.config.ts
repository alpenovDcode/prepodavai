import { LOGO_BASE64 } from '../generation.constants';

/**
 * Единая дизайн-система для всех AI-генераций (рабочие листы, квизы, планы уроков и т.д.)
 */
export const DesignSystemConfig = {
  // Токены дизайна
  TOKENS: {
    PRIMARY_COLOR: '#4f46e5', // Приглушенный синий (индиго)
    TEXT_COLOR: '#111827',    // Темно-серый
    BG_COLOR: '#f9fafb',      // Светло-серый фон
    BORDER_COLOR: '#e5e7eb',  // Граница
    CONTAINER_WIDTH: '800px',
    BORDER_RADIUS: '12px',
  },

  // Базовые стили для всех типов генераций
  STYLES: `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f9fafb; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111827; line-height: 1.6; padding: 20px; }
  .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
  .header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
  .header-logo { width: auto; height: 40px; }
  h1 { font-size: 28px; font-weight: 700; margin: 0; color: #111827; }
  h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #374151; }
  p { margin-bottom: 16px; }
  ul, ol { padding-left: 24px; margin-bottom: 20px; }
  li { margin-bottom: 8px; }
  
  /* Интерактивные поля */
  input[type="text"], textarea { 
    width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; 
    font-family: inherit; font-size: inherit; background: white; transition: border-color 0.2s;
  }
  input[type="text"]:focus, textarea:focus { outline: none; border-color: #4f46e5; }
  .inline-input { display: inline-block; width: 150px; border: none; border-bottom: 1px solid #9ca3af; border-radius: 0; padding: 0 4px; background: transparent; }

  .footer-logo { text-align: right; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
  .footer-logo img { width: 120px; opacity: 0.5; }
  
  /* Таблицы */
  table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; font-size: 14px; }
  th { background-color: #f9fafb; font-weight: 600; text-align: left; padding: 12px; border: 1px solid #d1d5db; }
  td { padding: 12px; border: 1px solid #e5e7eb; vertical-align: top; }

  /* Другие элементы */
  .meta-info { margin-bottom: 30px; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
  .callout { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; }
  
  .teacher-answers-only { margin-top: 40px; padding-top: 20px; border-top: 2px dashed #d1d5db; page-break-before: always; }
  .teacher-answers-only h2 { color: #dc2626; }

  @media (max-width: 640px) { .container { padding: 20px; } h1 { font-size: 24px; } }
  @media print { body { background: white; padding: 0; } .container { box-shadow: none; border: none; width: 100%; max-width: 100%; padding: 0; } }
</style>
`,

  // Скрипты MathJax
  // Внимательно: inlineMath содержит ТОЛЬКО \\(...\\) — одиночные $...$ отключены.
  // MATHJAX_RULES в промптах также запрещает $...$ для inline, чтобы не было расхождений.
  // Скрипты MathJax теперь вставляются динамически через HtmlPostprocessorService
  MATHJAX_SCRIPTS: '',

  // Готовые компоненты-заглушки (для сборки финального HTML)
  COMPONENTS: {
    HEADER: (title: string) => `
<div class="header">
  <img src="LOGO_PLACEHOLDER" class="header-logo" alt="Logo">
  <h1>${title}</h1>
</div>`,
    FOOTER: `
<div class="footer-logo">
  <img src="LOGO_PLACEHOLDER" alt="Logo">
</div>`,
  },

  // Модули для Системного Промпта
  PROMPT_MODULES: {
    SYSTEM_INTRO: `Ты — Методист мирового уровня с 20-летним стажем и Senior Frontend разработчик.
Твоя задача: спроектировать безупречный методический материал и сверстать его в идеальный HTML-код.`,

    MATHJAX_RULES: `МАТЕМАТИЧЕСКИЕ И ХИМИЧЕСКИЕ ФОРМУЛЫ (MathJax) - СТРОГИЕ ПРАВИЛА:
1. ЛЮБАЯ формула, уравнение, индекс, степень, дробь, корень ОБЯЗАТЕЛЬНО оборачивается в MathJax-разделители.
   Это относится и к химии (6CO_2, H_2O, CH_4), и к физике (v_0, E=mc^2), и к математике.
2. Внутристрочные (inline): СТРОГО \\\\(...\\\\). Пример: \\\\(x^2\\\\), \\\\(H_2O\\\\), \\\\(6CO_2 + 6H_2O\\\\).
3. Отдельной строкой (display): СТРОГО $$...$$ или \\\\[...\\\\]. Пример: $$6CO_2 + 6H_2O \\\\xrightarrow{h\\\\nu} C_6H_{12}O_6 + 6O_2$$.
4. ЗАПРЕЩЕНО: одинарные $...$, голые индексы вне разделителей (НЕЛЬЗЯ писать "6CO_2" в обычном тексте — только \\\\(6CO_2\\\\)).
5. Никогда не используй кириллицу внутри формул.
6. Не вставляй скрипт MathJax вручную — он будет добавлен автоматически.`,

    INTERACTIVE_RULES: `ИНТЕРАКТИВНЫЕ ПОЛЯ (ОБЯЗАТЕЛЬНО):
Документ должен быть цифровым рабочим листом.
1. Ответы ученика: СТРОГО <input type="text"> или <textarea>.
2. ЗАПРЕЩЕНО: подчеркивания (____), точки (....), пустые скобки.
3. Пример для вставки слова: <input type="text" class="inline-input">`,

    CRITICAL_OUTPUT_RULES: `КРИТИЧЕСКИЕ ПРАВИЛА ВЫВОДА:
1. Вывод начинается СТРОГО с <!DOCTYPE html> и заканчивается </html>.
2. НИКАКОГО текста до или после кода. Никаких пояснений.
3. БЕЗ MARKDOWN (не используй \`\`\`html). Верни чистую строку кода.`,
  },
};
