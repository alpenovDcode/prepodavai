import { Slide, SlideDoc, SlideLayout, SlideThemeId } from '@/types/slide-doc';

const newId = () => `slide_${Math.random().toString(36).slice(2, 10)}`;

export const updateSlide = (
  doc: SlideDoc,
  slideIdx: number,
  patch: Partial<Slide> | ((s: Slide) => Slide),
): SlideDoc => ({
  ...doc,
  slides: doc.slides.map((s, i) => {
    if (i !== slideIdx) return s;
    return typeof patch === 'function' ? patch(s) : { ...s, ...patch };
  }),
});

export const updateSlideContent = <K extends keyof Slide['content']>(
  doc: SlideDoc,
  slideIdx: number,
  field: K,
  value: Slide['content'][K],
): SlideDoc =>
  updateSlide(doc, slideIdx, (s) => ({
    ...s,
    content: { ...s.content, [field]: value },
  }));

export const setBullets = (
  doc: SlideDoc,
  slideIdx: number,
  bullets: string[],
): SlideDoc => updateSlideContent(doc, slideIdx, 'bullets', bullets);

export const updateColumn = (
  doc: SlideDoc,
  slideIdx: number,
  side: 'leftColumn' | 'rightColumn',
  patch: Partial<NonNullable<Slide['content']['leftColumn']>>,
): SlideDoc =>
  updateSlide(doc, slideIdx, (s) => ({
    ...s,
    content: {
      ...s.content,
      [side]: { ...(s.content[side] || {}), ...patch },
    },
  }));

export const updateQuote = (
  doc: SlideDoc,
  slideIdx: number,
  patch: Partial<NonNullable<Slide['content']['quote']>>,
): SlideDoc =>
  updateSlide(doc, slideIdx, (s) => ({
    ...s,
    content: {
      ...s.content,
      quote: { text: '', ...(s.content.quote || {}), ...patch },
    },
  }));

export const updateQuiz = (
  doc: SlideDoc,
  slideIdx: number,
  patch: Partial<NonNullable<Slide['content']['quiz']>>,
): SlideDoc =>
  updateSlide(doc, slideIdx, (s) => ({
    ...s,
    content: {
      ...s.content,
      quiz: {
        question: '',
        options: ['', ''],
        answerIndex: 0,
        ...(s.content.quiz || {}),
        ...patch,
      },
    },
  }));

export const setLayout = (
  doc: SlideDoc,
  slideIdx: number,
  layout: SlideLayout,
): SlideDoc => updateSlide(doc, slideIdx, { layout });

export const setTheme = (doc: SlideDoc, themeId: SlideThemeId): SlideDoc => ({
  ...doc,
  themeId,
});

const blankSlide = (layout: SlideLayout): Slide => {
  const base: Slide = {
    id: newId(),
    layout,
    content: { title: 'Новый слайд' },
  };
  switch (layout) {
    case 'title':
      return { ...base, content: { title: 'Заголовок', subtitle: 'Подзаголовок' } };
    case 'agenda':
    case 'bullets':
    case 'summary':
      return {
        ...base,
        content: { title: 'Заголовок', bullets: ['Пункт 1', 'Пункт 2', 'Пункт 3'] },
      };
    case 'two-column':
      return {
        ...base,
        content: {
          title: 'Сравнение',
          leftColumn: { heading: 'Слева', bullets: ['Пункт 1'] },
          rightColumn: { heading: 'Справа', bullets: ['Пункт 1'] },
        },
      };
    case 'image-text':
      return {
        ...base,
        content: { title: 'Заголовок', bullets: ['Пункт 1', 'Пункт 2'] },
        image: { prompt: 'educational illustration, clean, minimalist' },
      };
    case 'quote':
      return { ...base, content: { title: 'Цитата', quote: { text: 'Текст цитаты', attribution: 'Автор' } } };
    case 'quiz':
      return {
        ...base,
        content: {
          title: 'Проверь себя',
          quiz: { question: 'Вопрос?', options: ['A', 'B', 'C', 'D'], answerIndex: 0 },
        },
      };
    default:
      return base;
  }
};

export const insertSlide = (
  doc: SlideDoc,
  afterIdx: number,
  layout: SlideLayout = 'bullets',
): SlideDoc => {
  const next = [...doc.slides];
  next.splice(afterIdx + 1, 0, blankSlide(layout));
  return { ...doc, slides: next };
};

export const deleteSlide = (doc: SlideDoc, slideIdx: number): SlideDoc => {
  if (doc.slides.length <= 1) return doc;
  return { ...doc, slides: doc.slides.filter((_, i) => i !== slideIdx) };
};

export const duplicateSlide = (doc: SlideDoc, slideIdx: number): SlideDoc => {
  const src = doc.slides[slideIdx];
  if (!src) return doc;
  const copy: Slide = { ...src, id: newId(), content: { ...src.content } };
  const next = [...doc.slides];
  next.splice(slideIdx + 1, 0, copy);
  return { ...doc, slides: next };
};

export const moveSlide = (
  doc: SlideDoc,
  slideIdx: number,
  delta: -1 | 1,
): SlideDoc => {
  const target = slideIdx + delta;
  if (target < 0 || target >= doc.slides.length) return doc;
  const next = [...doc.slides];
  [next[slideIdx], next[target]] = [next[target], next[slideIdx]];
  return { ...doc, slides: next };
};
