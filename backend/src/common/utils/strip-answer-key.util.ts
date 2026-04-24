/**
 * Удаляет раздел с ответами («ключ для учителя») из HTML-контента генерации.
 *
 * Основной маркер — обёртка `<div class="teacher-answers-only">…</div>`,
 * которую зашивают промпты стратегий (worksheet / quiz / exam-variant и др.).
 * Остальные паттерны — fallback на случай, если модель не проставила класс.
 */
export function stripAnswerKeyFromHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;
  let result = html;

  // 1. Элемент с классом teacher-answers-only
  result = result.replace(
    /<div[^>]*class\s*=\s*["'][^"']*teacher-answers-only[^"']*["'][^>]*>[\s\S]*/i,
    '',
  );

  // 2. Горизонтальный разделитель, ЗА которым в пределах ~200 символов идёт
  //    заголовок/слово из секции ответов. Без проверки контекста этот regex
  //    нельзя применять — <hr> часто используется просто как декоративный
  //    разделитель между вопросами, и тогда он уничтожает весь контент.
  result = result.replace(
    /<hr[^>]*>[\s\S]{0,200}?(?:Ключ\s*[Оо]тветов|ОТВЕТЫ|[Оо]тветы(?:[\s<:]|\b))[\s\S]*/i,
    '',
  );

  // 3. Заголовки «Ключ ответов»
  result = result.replace(
    /<(h[1-6]|p)\b[^>]*>(?:<[^>]*>)*\s*Ключ\s*[Оо]тветов\s*(?:<\/[^>]*>)*<\/\1>[\s\S]*/i,
    '',
  );

  // 4. Заголовки h1-h6, НАЧИНАЮЩИЕСЯ со слова «ОТВЕТЫ» / «Ответы».
  //    Допускается любой текст после (напр. "ОТВЕТЫ И КРИТЕРИИ ОЦЕНИВАНИЯ"
  //    в шаблоне КИМ).
  result = result.replace(
    /<h[1-6]\b[^>]*>(?:<[^>]*>)*\s*[ОоOo][тТtT][вВvV][еЕeE][тТtT][ыЫyY]\b[^<]*(?:<\/[^>]*>)*<\/h[1-6]>[\s\S]*/i,
    '',
  );

  // 5. Параграф / div с выравниванием по центру, начинающийся с «ОТВЕТЫ»
  result = result.replace(
    /<(?:p|div)\b[^>]*(?:center|text-align\s*:\s*center)[^>]*>(?:<[^>]*>)*\s*[ОоOo][тТtT][вВvV][еЕeE][тТtT][ыЫyY]\b[^<]*(?:<\/[^>]*>)*<\/(?:p|div)>[\s\S]*/i,
    '',
  );

  // 6. Таблица ответов с колонками «Ответ» и «Баллы»
  result = result.replace(
    /<table\b[^>]*>(?:(?!<\/table>)[\s\S])*(?:[Оо]твет|ОТВЕТ)(?:(?!<\/table>)[\s\S])*(?:[Бб]алл|БАЛЛ)(?:(?!<\/table>)[\s\S])*<\/table>/g,
    '',
  );

  // 7. Финальный fallback — обрезаем от «Ключ ответов» / «ОТВЕТЫ»
  const cutoff = result.search(/(?:Ключ\s*[Оо]тветов|^ОТВЕТЫ$)/im);
  if (cutoff > 0) result = result.slice(0, cutoff);

  // Закрываем висящие <body>/<html>, если обрезали внутри них
  if (/<body[\s>]/i.test(result) && !/<\/body>/i.test(result)) {
    result = `${result.trim()}</body>`;
  }
  if (/<html[\s>]/i.test(result) && !/<\/html>/i.test(result)) {
    result = `${result.trim()}</html>`;
  }

  return result.trim();
}
