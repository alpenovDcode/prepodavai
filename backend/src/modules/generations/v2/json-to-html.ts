import type { GenerationDocumentT, BlockT } from './blocks-schema';

/**
 * Серверный рендер JSON-блоков в HTML-строку для PDF/DOCX export.
 *
 * Делаем простой шаблон-движок без React, потому что:
 *   - В backend проще обойтись без react-dom/server (минус зависимость)
 *   - HTML здесь read-only по природе — не нужны реактивные компоненты
 *   - Полностью идемпотентно с фронт-рендером: тот же дизайн, те же блоки
 *
 * LaTeX рендерится KaTeX'ом в браузере (в Playwright), через CDN-скрипт.
 * Это надёжнее, чем серверный KaTeX (одинаковая версия везде, нет race conditions).
 */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #ffffff; font-family: 'Inter', system-ui, sans-serif; color: #111827; line-height: 1.6; }
.page { padding: 32px 40px; max-width: 840px; margin: 0 auto; }
.doc-header { margin-bottom: 28px; padding-bottom: 18px; border-bottom: 2px solid #e5e7eb; }
.doc-title { font-size: 26px; font-weight: 800; color: #111827; margin: 0 0 10px; line-height: 1.2; }
.doc-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; font-size: 12.5px; color: #6b7280; }
.doc-meta strong { color: #374151; font-weight: 600; margin-right: 4px; }
h1 { font-size: 26px; font-weight: 800; margin: 0 0 14px; color: #111827; }
h2 { font-size: 20px; font-weight: 700; margin: 28px 0 12px; color: #1f2937; }
h3 { font-size: 17px; font-weight: 600; margin: 22px 0 10px; color: #374151; }
p { margin: 0 0 14px; font-size: 14.5px; line-height: 1.65; color: #1f2937; }
ul, ol { padding-left: 22px; margin: 0 0 14px; }
li { margin-bottom: 6px; }
table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; page-break-inside: avoid; }
th { background: #f9fafb; font-weight: 600; text-align: left; padding: 10px; border: 1px solid #d1d5db; }
td { padding: 10px; border: 1px solid #e5e7eb; vertical-align: top; }
.callout { border-left: 4px solid; padding: 12px 14px; margin: 14px 0; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
.callout-title { font-weight: 700; font-size: 13.5px; margin-bottom: 4px; }
.callout-body { font-size: 14px; line-height: 1.55; }
.callout-info { background: #f0f9ff; border-color: #0ea5e9; color: #0c4a6e; }
.callout-warning { background: #fffbeb; border-color: #f59e0b; color: #92400e; }
.callout-success { background: #ecfdf5; border-color: #10b981; color: #065f46; }
.callout-tip { background: #f5f3ff; border-color: #8b5cf6; color: #5b21b6; }
.callout-methodology { background: #f9fafb; border-color: #6b7280; color: #111827; }
.spacer-sm { height: 8px; }
.spacer-md { height: 18px; }
.spacer-lg { height: 36px; }
.math-display { margin: 14px 0; text-align: center; }
.math-caption { text-align: center; font-size: 12.5px; color: #6b7280; margin-top: 4px; }
.fill-blank-line { font-size: 14.5px; line-height: 1.9; margin: 12px 0; }
.fill-input { display: inline-block; min-width: 90px; padding: 0 4px; border: none; border-bottom: 1px solid #9ca3af; }
.answer-chip { display: inline-block; padding: 2px 6px; margin: 0 2px; border-radius: 3px; background: #d1fae5; color: #065f46; font-weight: 600; }
.mc { margin: 14px 0; }
.mc-question { font-weight: 600; margin-bottom: 8px; }
.mc-options { list-style: none; padding: 0; margin: 0; }
.mc-options li { display: flex; gap: 8px; align-items: flex-start; padding: 4px 0; }
.mc-marker { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #9ca3af; flex-shrink: 0; margin-top: 3px; }
.mc-marker.radio { border-radius: 50%; }
.mc-correct { color: #047857; font-weight: 700; }
.mc-correct .mc-marker { background: #10b981; border-color: #10b981; }
.sa-question { font-weight: 600; margin-bottom: 6px; }
.sa-input { width: 100%; min-height: 28px; border-bottom: 1px solid #9ca3af; padding: 4px 0; margin-bottom: 8px; }
.sa-input.medium { min-height: 60px; border: 1px solid #d1d5db; padding: 8px; border-radius: 4px; }
.sa-input.long { min-height: 120px; border: 1px solid #d1d5db; padding: 8px; border-radius: 4px; }
.sa-expected { font-size: 12.5px; background: #ecfdf5; color: #065f46; padding: 6px 10px; border-radius: 4px; margin-top: 4px; }
.matching { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 14px 0; }
.matching-col { list-style: none; padding: 0; }
.matching-col li { padding: 6px 0; font-size: 14px; }
.matching-col li strong { color: #6b7280; margin-right: 6px; }
.matching-pairs { font-size: 12.5px; background: #ecfdf5; color: #065f46; padding: 6px 10px; border-radius: 4px; margin-top: 8px; }
img { max-width: 100%; height: auto; }
figure { margin: 16px 0; }
figcaption { text-align: center; font-size: 12.5px; color: #6b7280; margin-top: 4px; }
@media print {
    .page { padding: 24px 32px; }
    h2, h3 { page-break-after: avoid; }
    table, .callout, .mc, .matching { page-break-inside: avoid; }
}
`;

const KATEX_SCRIPT = `
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\[',right:'\\\\]',display:true},{left:'\\\\(',right:'\\\\)',display:false}]})"></script>
`;

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderText(s: string): string {
    // Inline-math делается KaTeX'ом на странице — нам достаточно эскейпнуть HTML.
    return escapeHtml(s);
}

function renderBlock(block: BlockT, showAnswers: boolean): string {
    switch (block.type) {
        case 'heading': {
            const level = block.level;
            return `<h${level}>${renderText(block.text)}</h${level}>`;
        }
        case 'paragraph':
            return `<p>${renderText(block.text)}</p>`;
        case 'callout': {
            const titleHtml = block.title ? `<div class="callout-title">${renderText(block.title)}</div>` : '';
            return `<div class="callout callout-${block.variant}">${titleHtml}<div class="callout-body">${renderText(block.text)}</div></div>`;
        }
        case 'spacer':
            return `<div class="spacer-${block.size}"></div>`;
        case 'math-display': {
            const caption = block.caption ? `<div class="math-caption">${escapeHtml(block.caption)}</div>` : '';
            return `<div class="math-display">$$${block.latex}$$${caption}</div>`;
        }
        case 'image': {
            const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : '';
            return `<figure><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || '')}"/>${caption}</figure>`;
        }
        case 'table': {
            const head = `<thead><tr>${block.headers.map((h) => `<th>${renderText(h)}</th>`).join('')}</tr></thead>`;
            const body = `<tbody>${block.rows
                .map((row) => `<tr>${row.map((c) => `<td>${renderText(c)}</td>`).join('')}</tr>`)
                .join('')}</tbody>`;
            const caption = block.caption ? `<caption>${escapeHtml(block.caption)}</caption>` : '';
            return `<table>${caption}${head}${body}</table>`;
        }
        case 'fill-blank': {
            const byIndex = new Map(block.blanks.map((b) => [b.index, b]));
            const parts = block.template.split(/(\{\{\d+\}\})/g);
            const rendered = parts
                .map((part) => {
                    const m = part.match(/^\{\{(\d+)\}\}$/);
                    if (!m) return renderText(part);
                    const idx = Number(m[1]);
                    const blank = byIndex.get(idx);
                    if (!blank) return `[${idx}?]`;
                    return showAnswers
                        ? `<span class="answer-chip">${renderText(blank.answer)}</span>`
                        : `<span class="fill-input">&nbsp;</span>`;
                })
                .join('');
            return `<div class="fill-blank-line">${rendered}</div>`;
        }
        case 'multiple-choice': {
            const marker = block.multiple ? 'mc-marker' : 'mc-marker radio';
            const options = block.options
                .map((opt) => {
                    const isCorrect = showAnswers && opt.correct;
                    return `<li class="${isCorrect ? 'mc-correct' : ''}"><span class="${marker}"></span><span>${renderText(opt.text)}${isCorrect ? ' ✓' : ''}</span></li>`;
                })
                .join('');
            return `<div class="mc"><div class="mc-question">${renderText(block.question)}</div><ul class="mc-options">${options}</ul></div>`;
        }
        case 'short-answer': {
            const lengthCls = block.expectedLength || 'short';
            const expected = showAnswers && block.expectedAnswer
                ? `<div class="sa-expected"><strong>Ожидаемый ответ:</strong> ${renderText(block.expectedAnswer)}</div>`
                : '';
            return `<div><div class="sa-question">${renderText(block.question)}</div><div class="sa-input ${lengthCls}"></div>${expected}</div>`;
        }
        case 'matching': {
            const left = block.left.map((l) => `<li><strong>${escapeHtml(l.id)}.</strong>${renderText(l.text)}</li>`).join('');
            const right = block.right.map((r) => `<li><strong>${escapeHtml(r.id)}.</strong>${renderText(r.text)}</li>`).join('');
            const pairs = showAnswers && block.pairs.length
                ? `<div class="matching-pairs"><strong>Соответствия:</strong> ${block.pairs.map(([l, r]) => `${l}→${r}`).join(', ')}</div>`
                : '';
            return `<div><div class="sa-question">${renderText(block.instruction)}</div><div class="matching"><ul class="matching-col">${left}</ul><ul class="matching-col">${right}</ul></div>${pairs}</div>`;
        }
        case 'html-snippet':
            // Sanitization done at AI-side prompt level. Trust output here.
            return `<div>${block.html.replace(/<script[\s\S]*?<\/script>/gi, '')}</div>`;
    }
}

function renderHeader(doc: GenerationDocumentT): string {
    const meta = doc.meta || {};
    const pairs: Array<[string, string]> = [];
    if (meta.subject) pairs.push(['Предмет', meta.subject]);
    if (meta.grade) pairs.push(['Класс', meta.grade]);
    if (meta.duration) pairs.push(['Длительность', meta.duration]);
    if (meta.studentName) pairs.push(['Ученик', meta.studentName]);
    if (meta.date) pairs.push(['Дата', meta.date]);
    const metaHtml = pairs.length
        ? `<div class="doc-meta">${pairs.map(([k, v]) => `<span><strong>${escapeHtml(k)}:</strong>${escapeHtml(v)}</span>`).join('')}</div>`
        : '';
    return `<header class="doc-header"><h1 class="doc-title">${escapeHtml(doc.title)}</h1>${metaHtml}</header>`;
}

/**
 * Главная функция: рендерит документ в полный HTML с DOCTYPE.
 * Готово к скармливанию в Playwright/Chrome для PDF.
 */
export function renderDocumentToHtml(doc: GenerationDocumentT, options: { showAnswers?: boolean } = {}): string {
    const showAnswers = !!options.showAnswers;
    const blocksHtml = doc.blocks.map((b) => renderBlock(b, showAnswers)).join('\n');
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)}</title>
<style>${CSS}</style>
${KATEX_SCRIPT}
</head>
<body>
<div class="page">
${renderHeader(doc)}
${blocksHtml}
</div>
</body>
</html>`;
}
