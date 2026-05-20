/**
 * Удаляет раздел с ответами («ключ для учителя») из HTML-контента генерации.
 *
 * Основной маркер — обёртка `<div class="teacher-answers-only">…</div>`,
 * которую зашивают промпты стратегий (worksheet / quiz / exam-variant и др.).
 * Дополнительные паттерны — fallback на случай, если модель не проставила класс,
 * но они НАМЕРЕННО узкие: только когда заголовок ЯВНО говорит «для учителя»
 * или «Ключ ответов». Просто слово «Ответы» в заголовке НЕ триггерит срез —
 * это слишком частая фраза в инструкциях для ученика («Ответы запиши ниже»,
 * «Ответы оформляй печатными буквами» и т. п.).
 */
export function stripAnswerKeyFromHtml(html: string): string {
  if (!html || typeof html !== 'string') return html;
  let result = html;

  // 1. ОСНОВНОЕ: <div class="teacher-answers-only">…</div>.
  //    Удаляем сбалансированно — с учётом вложенных <div>. Без этого greedy `[\s\S]*`
  //    съедал бы хвост документа (включая `</body></html>` и любые секции после).
  result = removeBalancedDiv(result, 'teacher-answers-only');

  // 2. <h*>Ключ ответов</h*> + всё что за ним — однозначный маркер блока учителя.
  result = stripFromMatchToEnd(
    result,
    /<(h[1-6])\b[^>]*>(?:\s|<[^>]*>)*Ключ\s*[Оо]тветов\b/i,
  );

  // 3. <h*>Ответы (для учителя)</h*> / «Ответы для учителя» / «Ответы — учителю».
  //    ОБЯЗАТЕЛЕН квалификатор «для учителя» — без него не трогаем.
  result = stripFromMatchToEnd(
    result,
    /<(h[1-6])\b[^>]*>(?:\s|<[^>]*>)*[Оо]твет[ыов]?\b[^<]{0,40}для\s+учител[яеи]/i,
  );

  // 4. Центрированный заголовок с «ОТВЕТЫ И КРИТЕРИИ» / «КРИТЕРИИ ОЦЕНИВАНИЯ»
  //    (типовой шаблон КИМ / экзамена).
  result = stripFromMatchToEnd(
    result,
    /<(?:p|div)\b[^>]*(?:center|text-align\s*:\s*center)[^>]*>(?:\s|<[^>]*>)*(?:Ключ\s*[Оо]тветов|ОТВЕТЫ\s+И\s+КРИТЕРИИ|КРИТЕРИИ\s+ОЦЕНИВАНИЯ)\b/i,
  );

  // Если внутри обрезали — починим хвосты.
  if (/<body[\s>]/i.test(result) && !/<\/body>/i.test(result)) {
    result = `${result.trim()}\n</body>`;
  }
  if (/<html[\s>]/i.test(result) && !/<\/html>/i.test(result)) {
    result = `${result.trim()}\n</html>`;
  }
  return result.trim();
}

/**
 * Обрезает HTML от первого совпадения regex и до конца — но в отличие от старой
 * реализации НЕ использует greedy `[\s\S]*` внутри самого regex, а делает поиск
 * через `match()` и `slice()`. Это надёжнее и понятнее.
 */
function stripFromMatchToEnd(html: string, re: RegExp): string {
  const m = html.match(re);
  if (!m || m.index === undefined) return html;
  return html.slice(0, m.index);
}

/**
 * Удаляет первый встреченный <div class="...CLASSNAME..."> вместе с ПАРНЫМ </div>,
 * корректно считая вложенные <div>. Не оставляет неоткрытых/незакрытых тегов.
 * Если матч повторяется (несколько таких блоков подряд) — снимает все.
 */
function removeBalancedDiv(html: string, className: string): string {
  const openRe = new RegExp(
    `<div\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    'i',
  );
  let out = html;
  // Хвостовая защита: на случай 100 вложенных и одинаковых блоков
  // ограничиваем число итераций, чтобы regexp-катастрофа не подвесила процесс.
  for (let pass = 0; pass < 10; pass++) {
    const m = out.match(openRe);
    if (!m || m.index === undefined) break;

    const openEnd = m.index + m[0].length;
    // Считаем глубину: каждый <div…> — +1, каждый </div> — −1. Останавливаемся,
    // когда баланс достигает нуля → это парный закрывающий тег.
    let depth = 1;
    const tagRe = /<div\b[^>]*>|<\/div\s*>/gi;
    tagRe.lastIndex = openEnd;
    let closeStart = -1;
    let closeEnd = -1;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(out)) !== null) {
      if (tag[0].toLowerCase().startsWith('</div')) {
        depth--;
        if (depth === 0) {
          closeStart = tag.index;
          closeEnd = tag.index + tag[0].length;
          break;
        }
      } else {
        depth++;
      }
    }

    if (closeEnd === -1) {
      // Парный </div> не нашли (битый HTML от модели). Безопасный fallback —
      // обрезать от открывающего тега до конца документа: это совпадает со
      // старым поведением и точно убирает блок с ответами.
      out = out.slice(0, m.index);
      break;
    }
    out = out.slice(0, m.index) + out.slice(closeEnd);
  }
  return out;
}
