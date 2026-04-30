import { Slide, SlideContent } from './slide-doc.types';

const MAX_BULLETS = 5;
const MAX_BULLET_WORDS = 16;
const MAX_TITLE_CHARS = 80;
const MAX_SUBTITLE_CHARS = 120;
const MAX_PARAGRAPH_CHARS = 400;
const MAX_QUOTE_CHARS = 280;
const MAX_QUIZ_OPTIONS = 4;
const MAX_QUIZ_OPTION_CHARS = 80;

const truncWords = (text: string, maxWords: number): string => {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ').replace(/[,.;:—-]+$/, '') + '…';
};

const truncChars = (text: string | undefined, max: number): string | undefined => {
  if (!text) return text;
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
};

const cleanBullets = (bullets: string[] | undefined): string[] | undefined => {
  if (!bullets) return undefined;
  return bullets
    .filter((b) => typeof b === 'string' && b.trim().length > 0)
    .slice(0, MAX_BULLETS)
    .map((b) => truncWords(b, MAX_BULLET_WORDS));
};

/**
 * Post-LLM validator. Models often ignore length constraints in the prompt,
 * which breaks the renderer (overflow, viewport collapse). This is the
 * deterministic safety net — same rules every time, regardless of model.
 */
export function validateSlide(slide: Slide): Slide {
  const c: SlideContent = { ...slide.content };

  c.title = truncChars(c.title, MAX_TITLE_CHARS) || c.title || 'Слайд';
  c.subtitle = truncChars(c.subtitle, MAX_SUBTITLE_CHARS);
  c.paragraph = truncChars(c.paragraph, MAX_PARAGRAPH_CHARS);
  c.bullets = cleanBullets(c.bullets);
  c.footnote = truncChars(c.footnote, 160);

  if (c.leftColumn) {
    c.leftColumn = {
      heading: truncChars(c.leftColumn.heading, 40),
      bullets: cleanBullets(c.leftColumn.bullets),
      paragraph: truncChars(c.leftColumn.paragraph, MAX_PARAGRAPH_CHARS),
    };
  }
  if (c.rightColumn) {
    c.rightColumn = {
      heading: truncChars(c.rightColumn.heading, 40),
      bullets: cleanBullets(c.rightColumn.bullets),
      paragraph: truncChars(c.rightColumn.paragraph, MAX_PARAGRAPH_CHARS),
    };
  }

  if (c.quote) {
    c.quote = {
      text: truncChars(c.quote.text, MAX_QUOTE_CHARS) || c.quote.text || '',
      attribution: truncChars(c.quote.attribution, 80),
    };
  }

  if (c.quiz) {
    const options = (c.quiz.options || [])
      .filter((o) => typeof o === 'string' && o.trim().length > 0)
      .slice(0, MAX_QUIZ_OPTIONS)
      .map((o) => truncChars(o, MAX_QUIZ_OPTION_CHARS) as string);
    const answerIndex = Math.max(
      0,
      Math.min(
        Number.isFinite(c.quiz.answerIndex) ? c.quiz.answerIndex : 0,
        options.length - 1,
      ),
    );
    c.quiz = {
      question: truncChars(c.quiz.question, 200) || c.quiz.question || '',
      options: options.length >= 2 ? options : ['—', '—'],
      answerIndex,
    };
  }

  if (Array.isArray(c.math)) {
    c.math = c.math
      .filter((m) => typeof m === 'string' && m.trim().length > 0)
      .slice(0, 3)
      .map((m) => m.trim());
  }

  return {
    ...slide,
    content: c,
    speakerNotes: truncChars(slide.speakerNotes, 400),
  };
}
