/**
 * Удаление ключа ответов из HTML-материала на клиенте.
 *
 * ВАЖНО: эта функция должна применяться ОДИНАКОВО на странице ученика
 * (до заполнения интерактивного листа) и на странице учителя (при просмотре
 * заполненного бланка). Auto-id полей (hw_f_0, hw_f_1, ...) назначаются по
 * порядку DOM — если одна сторона режет HTML, а другая нет, сохранённые
 * ответы ученика сместятся в чужие ячейки.
 */
export function stripAnswerKey(content: string): string {
  let result = content

  // 1. Remove <div class="teacher-answers-only">...</div> and everything after it
  result = result.replace(/<div[^>]*class\s*=\s*["'][^"']*teacher-answers-only[^"']*["'][^>]*>[\s\S]*/i, '')

  // 2. <hr>, за которым в пределах ~200 символов идёт слово/заголовок из
  //    секции ответов. Без этой проверки контекста <hr> часто используется
  //    как декоративный разделитель между вопросами, и мы уничтожаем
  //    весь квиз. Правило с div.page-break|border-top|separator удалено
  //    по той же причине — слишком широкое совпадение.
  result = result.replace(
    /<hr[^>]*>[\s\S]{0,200}?(?:Ключ\s*[Оо]тветов|ОТВЕТЫ|[Оо]тветы(?:[\s<:]|\b))[\s\S]*/i,
    '',
  )

  // 3. Heading-based patterns — "Ключ ответов" and variants
  result = result.replace(/<(h[1-6]|p)\b[^>]*>[^<]*Ключ\s*ответов[^<]*<\/\1>[\s\S]*/i, '')
  result = result.replace(/<(h[1-6]|p)\b[^>]*>\s*<[^>]*>[^<]*Ключ\s*ответов[^<]*<\/[^>]*>\s*<\/\1>[\s\S]*/i, '')

  // 4. Heading tags STARTING with "ОТВЕТЫ"/"Ответы" (any text after allowed,
  //    e.g. "ОТВЕТЫ И КРИТЕРИИ ОЦЕНИВАНИЯ" в шаблоне КИМ).
  result = result.replace(/<(h[1-6])\b[^>]*>\s*(?:<[^>]*>)*\s*ОТВЕТЫ\b[^<]*(?:<\/[^>]*>)*\s*<\/\1>[\s\S]*/i, '')
  result = result.replace(/<(h[1-6])\b[^>]*>\s*(?:<[^>]*>)*\s*Ответы\b[^<]*(?:<\/[^>]*>)*\s*<\/\1>[\s\S]*/i, '')

  // 5. Paragraph/div acting as heading starting with "ОТВЕТЫ" (centered, bold, etc.)
  result = result.replace(/<p\b[^>]*(?:text-align\s*:\s*center|align\s*=\s*["']center["'])[^>]*>\s*(?:<[^>]*>)*\s*ОТВЕТЫ\b[^<]*(?:<\/[^>]*>)*\s*<\/p>[\s\S]*/i, '')
  result = result.replace(/<div\b[^>]*(?:text-align\s*:\s*center|align\s*=\s*["']center["'])[^>]*>\s*(?:<[^>]*>)*\s*ОТВЕТЫ\b[^<]*(?:<\/[^>]*>)*\s*<\/div>[\s\S]*/i, '')

  // 6. Table that looks like an answer key: has "Ответ" AND ("Баллы" OR "Балл") in header row
  result = result.replace(/<table\b[^>]*>(?:(?!<\/table>)[\s\S])*(?:Ответ|ОТВЕТ)(?:(?!<\/table>)[\s\S])*(?:Балл|БАЛЛ)(?:(?!<\/table>)[\s\S])*<\/table>/gi, '')

  // 7. Plain text patterns
  result = result.replace(/^[\s\-–—]*Ключ\s*ответов[^\n]*\n[\s\S]*/im, '')
  result = result.replace(/^[\s\-–—]*ОТВЕТЫ\s*\n[\s\S]*/im, '')

  // 8. Final fallback — if any of these keywords remain at top level, cut from there
  const ANSWER_PATTERNS = [/Ключ\s*ответов/i, /^ОТВЕТЫ$/im]
  for (const pat of ANSWER_PATTERNS) {
    if (pat.test(result)) {
      const idx = result.search(pat)
      if (idx > 0) result = result.slice(0, idx)
    }
  }

  return result.trim()
}
