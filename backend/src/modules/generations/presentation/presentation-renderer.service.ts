import { Injectable } from '@nestjs/common';
import { Slide, SlideDoc } from './slide-doc.types';
import { pickTheme, SlideTheme } from './presentation-themes';

const escape = (s: string | undefined): string => {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// LaTeX is preserved verbatim (MathJax will render it). Only HTML-escape
// the surrounding context, not the formula body.
const wrapMath = (formulas: string[] | undefined): string => {
  if (!formulas?.length) return '';
  return formulas
    .map((f) => `<div class="slide-math">\\[${f}\\]</div>`)
    .join('');
};

const renderBullets = (bullets?: string[]): string => {
  if (!bullets?.length) return '';
  const items = bullets.map((b) => `<li>${escape(b)}</li>`).join('');
  return `<ul class="slide-bullets">${items}</ul>`;
};

@Injectable()
export class PresentationRendererService {
  /**
   * Render a single slide to a self-contained HTML fragment (no <html>/<body>).
   * Layout: 16:9 fullscreen container with theme-driven CSS variables.
   */
  renderSlide(slide: Slide, theme: SlideTheme): string {
    const inner = this.renderLayout(slide, theme);
    return `<section class="slide" data-layout="${slide.layout}" style="--accent:${theme.accent};--accent-soft:${theme.accentSoft};--text:${theme.text};--text-muted:${theme.textMuted};--surface:${theme.surface};--border:${theme.border};--bg:${theme.bg};">
      ${inner}
    </section>`;
  }

  private renderLayout(slide: Slide, _theme: SlideTheme): string {
    const c = slide.content;
    const accentBar = '<div class="accent-bar"></div>';
    const head = (title: string, subtitle?: string) =>
      `<header class="slide-head"><h1>${escape(title)}</h1>${subtitle ? `<p class="slide-subtitle">${escape(subtitle)}</p>` : ''}${accentBar}</header>`;

    switch (slide.layout) {
      case 'title':
        return `
          <div class="layout-title">
            <h1 class="cover-title">${escape(c.title)}</h1>
            ${c.subtitle ? `<p class="cover-subtitle">${escape(c.subtitle)}</p>` : ''}
            <div class="cover-bar"></div>
          </div>`;

      case 'agenda':
      case 'bullets':
      case 'summary':
        return `
          ${head(c.title, c.subtitle)}
          <div class="slide-body">
            ${renderBullets(c.bullets)}
            ${c.paragraph ? `<p class="slide-paragraph">${escape(c.paragraph)}</p>` : ''}
            ${wrapMath(c.math)}
          </div>
          ${c.footnote ? `<footer class="slide-footnote">${escape(c.footnote)}</footer>` : ''}`;

      case 'two-column':
        return `
          ${head(c.title)}
          <div class="slide-body two-col">
            <div class="col">
              ${c.leftColumn?.heading ? `<h2>${escape(c.leftColumn.heading)}</h2>` : ''}
              ${renderBullets(c.leftColumn?.bullets)}
              ${c.leftColumn?.paragraph ? `<p>${escape(c.leftColumn.paragraph)}</p>` : ''}
            </div>
            <div class="col">
              ${c.rightColumn?.heading ? `<h2>${escape(c.rightColumn.heading)}</h2>` : ''}
              ${renderBullets(c.rightColumn?.bullets)}
              ${c.rightColumn?.paragraph ? `<p>${escape(c.rightColumn.paragraph)}</p>` : ''}
            </div>
          </div>`;

      case 'image-text': {
        const imgUrl = slide.image?.url || '';
        const imgAlt = escape(slide.image?.alt || c.title);
        return `
          ${head(c.title)}
          <div class="slide-body image-text">
            <div class="text-side">
              ${renderBullets(c.bullets)}
              ${c.paragraph ? `<p class="slide-paragraph">${escape(c.paragraph)}</p>` : ''}
              ${wrapMath(c.math)}
            </div>
            <div class="image-side">
              ${imgUrl ? `<img src="${escape(imgUrl)}" alt="${imgAlt}" />` : '<div class="image-placeholder"></div>'}
            </div>
          </div>`;
      }

      case 'quote':
        return `
          ${head(c.title)}
          <blockquote class="slide-quote">
            <p>«${escape(c.quote?.text || '')}»</p>
            ${c.quote?.attribution ? `<cite>— ${escape(c.quote.attribution)}</cite>` : ''}
          </blockquote>`;

      case 'quiz': {
        const quiz = c.quiz;
        const opts = (quiz?.options || [])
          .map((o, i) => `<li class="quiz-option" data-correct="${i === quiz?.answerIndex}">${escape(o)}</li>`)
          .join('');
        return `
          ${head(c.title)}
          <div class="slide-body quiz">
            <p class="quiz-question">${escape(quiz?.question || '')}</p>
            <ol class="quiz-options" type="A">${opts}</ol>
          </div>`;
      }

      default:
        return `${head(c.title)}<div class="slide-body">${renderBullets(c.bullets)}</div>`;
    }
  }

  /**
   * Build full landscape HTML doc for ALL slides — used by PDF service.
   * Each .slide is forced to 1280×720 with page-break between.
   */
  renderDeckHtml(doc: SlideDoc): string {
    const theme = pickTheme(doc.themeId);
    const slidesHtml = doc.slides
      .map((s) => this.renderSlide(s, theme))
      .join('\n');

    const notesHtml = this.renderSpeakerNotesPage(doc, theme);

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escape(doc.topic)}</title>
${this.deckStyles()}
</head>
<body>
${slidesHtml}
${notesHtml}
</body>
</html>`;
  }

  /**
   * Append a teacher-notes page after the deck if any slide has speakerNotes.
   * Same 1280×720 frame as a slide, but plain typography — meant to be the
   * last printed page (the one teachers tear off).
   */
  private renderSpeakerNotesPage(doc: SlideDoc, theme: SlideTheme): string {
    const items = doc.slides
      .map((s, idx) => ({ idx, title: s.content.title, notes: s.speakerNotes?.trim() }))
      .filter((s) => s.notes);
    if (!items.length) return '';

    const rows = items
      .map(
        (it) =>
          `<div class="notes-row"><div class="notes-num">${it.idx + 1}</div><div class="notes-body"><div class="notes-title">${escape(it.title)}</div><div class="notes-text">${escape(it.notes!)}</div></div></div>`,
      )
      .join('');

    return `<section class="slide notes-page" style="--accent:${theme.accent};--text:${theme.text};--text-muted:${theme.textMuted};--surface:${theme.surface};--border:${theme.border};--bg:${theme.bg};">
      <header class="slide-head"><h1>Заметки для учителя</h1><div class="accent-bar"></div></header>
      <div class="slide-body notes-list">${rows}</div>
    </section>`;
  }

  private deckStyles(): string {
    return `<style>
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  .slide {
    width: 1280px; height: 720px;
    padding: 56px 80px;
    page-break-after: always;
    break-after: page;
    background: var(--bg);
    color: var(--text);
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .slide:last-of-type { page-break-after: auto; break-after: auto; }
  .slide-head { margin-bottom: 32px; }
  .slide-head h1 {
    margin: 0;
    font-size: 44px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
    line-height: 1.15;
  }
  .slide-subtitle {
    margin: 8px 0 0;
    font-size: 22px;
    color: var(--text-muted);
    font-weight: 500;
  }
  .accent-bar {
    margin-top: 16px;
    width: 64px; height: 4px;
    background: var(--accent);
    border-radius: 2px;
  }
  .slide-body { flex: 1; min-height: 0; }
  .slide-bullets {
    margin: 0; padding: 0; list-style: none;
    display: flex; flex-direction: column; gap: 14px;
  }
  .slide-bullets li {
    font-size: 24px; line-height: 1.45;
    padding-left: 28px;
    position: relative;
    color: var(--text);
  }
  .slide-bullets li::before {
    content: '';
    position: absolute; left: 0; top: 12px;
    width: 10px; height: 10px;
    background: var(--accent);
    border-radius: 2px;
  }
  .slide-paragraph { font-size: 22px; line-height: 1.55; color: var(--text); margin: 0 0 12px; }
  .slide-math { font-size: 22px; margin: 16px 0; color: var(--text); }
  .slide-footnote { font-size: 14px; color: var(--text-muted); margin-top: 16px; }

  /* Title cover */
  .layout-title { display: flex; flex-direction: column; justify-content: center; height: 100%; }
  .cover-title { margin: 0; font-size: 64px; font-weight: 700; letter-spacing: -0.03em; color: var(--text); line-height: 1.1; }
  .cover-subtitle { margin: 16px 0 0; font-size: 28px; color: var(--text-muted); }
  .cover-bar { margin-top: 32px; width: 96px; height: 6px; background: var(--accent); border-radius: 3px; }

  /* Two columns */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; height: 100%; }
  .two-col .col {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    border-radius: 12px;
    padding: 24px 28px;
  }
  .two-col h2 { margin: 0 0 12px; font-size: 24px; color: var(--accent); font-weight: 600; }
  .two-col .slide-bullets li { font-size: 20px; }

  /* Image + text */
  .image-text { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; height: 100%; align-items: center; }
  .image-text .image-side {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    aspect-ratio: 4/3;
    display: flex; align-items: center; justify-content: center;
  }
  .image-text img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .image-placeholder { width: 100%; height: 100%; background: var(--accent-soft); }

  /* Quote */
  .slide-quote {
    margin: 32px 0 0; padding: 32px 40px;
    background: var(--accent-soft);
    border-left: 6px solid var(--accent);
    border-radius: 8px;
    font-size: 28px; line-height: 1.5; color: var(--text);
  }
  .slide-quote p { margin: 0; font-style: italic; }
  .slide-quote cite { display: block; margin-top: 16px; font-size: 18px; color: var(--text-muted); font-style: normal; }

  /* Quiz */
  .quiz-question { font-size: 26px; font-weight: 600; margin: 0 0 20px; color: var(--text); }
  .quiz-options { margin: 0; padding-left: 28px; display: flex; flex-direction: column; gap: 12px; }
  .quiz-option {
    font-size: 22px; line-height: 1.4;
    padding: 12px 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .quiz-option[data-correct="true"] {
    border-color: var(--accent);
    background: var(--accent-soft);
    font-weight: 600;
  }

  /* Speaker notes page (last page) */
  .notes-page { padding: 56px 80px; }
  .notes-list { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }
  .notes-row { display: grid; grid-template-columns: 36px 1fr; gap: 16px; align-items: flex-start; }
  .notes-num {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-weight: 700; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
  }
  .notes-title { font-weight: 600; font-size: 16px; color: var(--text); margin-bottom: 4px; }
  .notes-text { font-size: 14px; line-height: 1.5; color: var(--text-muted); }

  @media print {
    .slide { box-shadow: none; }
  }
</style>`;
  }
}
