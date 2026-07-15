/**
 * Определение целевого языка учебного материала по названию предмета.
 *
 * Проблема, которую решает файл: для языковых предметов («Испанский язык»)
 * промпты не указывали язык контента, и модель генерировала задания на
 * английском вместо изучаемого языка. Здесь мы по названию предмета
 * определяем изучаемый язык и формируем директиву для LLM-промпта, которая
 * фиксирует: язык всего учебного материала = язык предмета.
 */

export interface ForeignLanguage {
  /** Именительный падеж: «испанский» (для «предмет — испанский»). */
  nominative: string;
  /** Предложный падеж: «испанском» (для «пиши на испанском»). */
  prepositional: string;
}

/**
 * Маркеры в названии предмета → язык. Маркеры в нижнем регистре, покрывают
 * русские и латинские написания. Порядок не важен: совпадение по подстроке.
 */
const FOREIGN_LANGUAGE_SUBJECTS: Array<{ markers: string[] } & ForeignLanguage> = [
  { markers: ['англ', 'english'], nominative: 'английский', prepositional: 'английском' },
  { markers: ['испан', 'spanish', 'español', 'espanol'], nominative: 'испанский', prepositional: 'испанском' },
  { markers: ['немец', 'немецк', 'deutsch', 'german'], nominative: 'немецкий', prepositional: 'немецком' },
  { markers: ['франц', 'french', 'français', 'francais'], nominative: 'французский', prepositional: 'французском' },
  { markers: ['итальян', 'italian', 'italiano'], nominative: 'итальянский', prepositional: 'итальянском' },
  { markers: ['китайск', 'chinese'], nominative: 'китайский', prepositional: 'китайском' },
  { markers: ['япон', 'japanese'], nominative: 'японский', prepositional: 'японском' },
  { markers: ['корейск', 'korean'], nominative: 'корейский', prepositional: 'корейском' },
  { markers: ['португал', 'portuguese', 'português'], nominative: 'португальский', prepositional: 'португальском' },
  { markers: ['арабск', 'arabic'], nominative: 'арабский', prepositional: 'арабском' },
  { markers: ['турецк', 'turkish'], nominative: 'турецкий', prepositional: 'турецком' },
  { markers: ['латин', 'latin'], nominative: 'латинский', prepositional: 'латинском' },
];

/**
 * Определяет изучаемый иностранный язык по названию предмета.
 * Возвращает null, если предмет не языковой или это русский язык
 * (родной язык обучения — материал и так на русском).
 */
export function detectForeignLanguage(subject?: string | null): ForeignLanguage | null {
  if (!subject) return null;
  const s = subject.toLowerCase();
  // «Русский язык» — родной язык обучения, спец-режим не нужен.
  if (s.includes('русск') || s.includes('russian')) return null;
  for (const lang of FOREIGN_LANGUAGE_SUBJECTS) {
    if (lang.markers.some((m) => s.includes(m))) {
      return { nominative: lang.nominative, prepositional: lang.prepositional };
    }
  }
  return null;
}

/**
 * Формирует блок-директиву о языке учебного материала для LLM-промпта.
 * Для неязыковых предметов (и русского) возвращает пустую строку —
 * язык вывода остаётся русским по умолчанию.
 */
export function subjectLanguageDirective(subject?: string | null): string {
  const lang = detectForeignLanguage(subject);
  if (!lang) return '';

  const noEnglishWarning =
    lang.nominative === 'английский'
      ? ''
      : `\nКАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать задания на английском языке: предмет — не английский, а ${lang.nominative}.`;

  return `
═══ ЯЗЫК УЧЕБНОГО МАТЕРИАЛА (КРИТИЧНО) ═══
Предмет — иностранный язык (${lang.nominative}). Поэтому ВЕСЬ языковой материал —
тексты, задания, примеры, предложения, вопросы и варианты ответов — пиши на ${lang.prepositional} языке.
Короткие формулировки-инструкции к заданиям («Заполните пропуски», «Прочитайте текст»,
«Выберите верный вариант») можно давать на русском, чтобы ученику было понятно, ЧТО делать.
Перевод на русский добавляй только там, где это часть задания (например, в словарной статье).${noEnglishWarning}`;
}
