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

// Канонический CSS — 1-в-1 с DocumentRenderer.tsx на фронте и
// DesignSystemConfig.STYLES в design-system.config.ts. При изменении
// одной из трёх частей — синхронизировать остальные.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
@import url('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f9fafb; font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; line-height: 1.6; padding: 20px; }
.container { max-width: 100%; width: 100%; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.header { display: flex; align-items: center; gap: 20px; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
.header-logo { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
h1 { font-size: 28px; font-weight: 700; margin: 0; color: #111827; line-height: 1.2; }
h2 { font-size: 20px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #374151; }
h3 { font-size: 17px; font-weight: 600; margin-top: 24px; margin-bottom: 12px; color: #374151; }
p { margin: 0 0 16px; font-size: 15px; color: #111827; }
ul, ol { padding-left: 24px; margin: 0 0 20px; }
li { margin-bottom: 8px; }
input[type="text"], textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 12px; font-family: inherit; font-size: inherit; background: white; }
.inline-input { display: inline-block; width: 150px; border: none; border-bottom: 1px solid #9ca3af; border-radius: 0; padding: 0 4px; background: transparent; }
.meta-info { margin-bottom: 30px; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 14px; color: #6b7280; }
.meta-info-item strong { color: #374151; font-weight: 600; margin-right: 4px; }
table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; page-break-inside: avoid; }
th { background: #f9fafb; font-weight: 600; text-align: left; padding: 12px; border: 1px solid #d1d5db; }
td { padding: 12px; border: 1px solid #e5e7eb; vertical-align: top; }
.callout { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0; page-break-inside: avoid; }
.callout.callout-warning { background: #fffbeb; border-left-color: #f59e0b; }
.callout.callout-success { background: #ecfdf5; border-left-color: #10b981; }
.callout.callout-tip { background: #f5f3ff; border-left-color: #8b5cf6; }
.callout.callout-methodology { background: #f9fafb; border-left-color: #6b7280; }
.callout-title { font-weight: 700; margin-bottom: 6px; }
.doc-intro { margin-bottom: 24px; }
.doc-section { margin-bottom: 28px; }
.section-label { font-size: 18px; font-weight: 700; color: #4f46e5; padding: 10px 14px; margin: 0 0 14px; border-left: 4px solid #6366f1; background: #eef2ff; border-radius: 0 8px 8px 0; page-break-after: avoid; }
.task-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px 24px; margin-bottom: 14px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); page-break-inside: avoid; }
.task-card-title { font-size: 17px; font-weight: 700; color: #4f46e5; margin-bottom: 12px; }
.task-card > *:first-child { margin-top: 0; }
.task-card > *:last-child { margin-bottom: 0; }
.task-card h2 { font-size: 16px; margin-top: 16px; margin-bottom: 8px; color: #374151; }
.task-card h3 { font-size: 15px; margin-top: 12px; margin-bottom: 6px; color: #4b5563; }
.vocab-entry { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; page-break-inside: avoid; }
.vocab-entry-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.vocab-term { font-size: 18px; font-weight: 700; color: #111827; }
.vocab-transcription { font-size: 14px; color: #6b7280; font-family: 'Doulos SIL', 'Times New Roman', serif; }
.vocab-pos { font-size: 12px; color: #4f46e5; background: #eef2ff; padding: 2px 8px; border-radius: 999px; font-weight: 500; }
.vocab-translation { font-size: 15px; color: #374151; margin-bottom: 6px; }
.vocab-example { font-size: 13.5px; color: #4b5563; margin-top: 4px; }
.vocab-example-label { font-weight: 600; color: #6b7280; }
.vocab-example-tr { color: #9ca3af; }
.vocab-note { font-size: 13px; color: #9ca3af; font-style: italic; margin-top: 4px; }
.vocab-note-label { font-weight: 600; }
.footer-logo { text-align: right; margin-top: 40px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
.footer-logo img { width: 32px; height: 32px; object-fit: contain; opacity: 0.5; display: inline-block; }
.teacher-answers-only { margin-top: 40px; padding-top: 20px; border-top: 2px dashed #d1d5db; page-break-before: always; }
.teacher-answers-only h2 { color: #dc2626; }
.answer-chip { display: inline-block; padding: 2px 8px; margin: 0 2px; border-radius: 4px; background: #d1fae5; color: #065f46; font-weight: 600; }
.mc-list { list-style: none; padding: 0; margin: 8px 0 20px; }
.mc-list li { display: flex; align-items: flex-start; gap: 10px; padding: 4px 8px; border-radius: 6px; margin-bottom: 4px; }
.mc-list li.correct { background: #ecfdf5; color: #065f46; }
.mc-marker { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #9ca3af; flex-shrink: 0; margin-top: 3px; }
.mc-marker.radio { border-radius: 50%; }
.math-display { margin: 16px 0; text-align: center; page-break-inside: avoid; }
.math-caption { text-align: center; font-size: 13px; color: #6b7280; margin-top: 6px; }
.fill-blank-input { display: inline-block; min-width: 90px; padding: 0 4px; border: none; border-bottom: 1px solid #9ca3af; }
.sa-input { width: 100%; min-height: 32px; border-bottom: 1px solid #9ca3af; padding: 6px 0; margin-bottom: 8px; }
.sa-input.medium { min-height: 70px; border: 1px solid #d1d5db; padding: 8px; border-radius: 6px; }
.sa-input.long { min-height: 130px; border: 1px solid #d1d5db; padding: 8px; border-radius: 6px; }
.sa-expected { font-size: 13px; background: #ecfdf5; color: #065f46; padding: 8px 12px; border-radius: 6px; margin-top: 6px; }
.matching-block { margin: 14px 0; page-break-inside: avoid; }
.matching-options { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 13.5px; }
.matching-options-label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
.matching-options ul { list-style: none; padding: 0; margin: 0; }
.matching-options li { padding: 2px 0; }
.matching-options li strong { color: #4f46e5; margin-right: 6px; }
.matching-rows { list-style: none; padding: 0; margin: 0; }
.matching-rows li { padding: 6px 0; font-size: 14px; display: flex; align-items: center; gap: 10px; }
.matching-rows li strong { color: #6b7280; min-width: 22px; }
.match-arrow { color: #9ca3af; }
.match-slot { display: inline-block; min-width: 32px; padding: 0 8px; border-bottom: 1px solid #9ca3af; font-weight: 600; }
.match-answer { display: inline-block; min-width: 32px; padding: 2px 10px; border-radius: 4px; background: #d1fae5; color: #065f46; font-weight: 600; }
img { max-width: 100%; height: auto; border-radius: 6px; }
figure { margin: 16px 0; }
figcaption { text-align: center; font-size: 13px; color: #6b7280; margin-top: 6px; }
@media print {
    body { background: white; padding: 0; }
    .container { box-shadow: none; border-radius: 0; padding: 24px 32px; }
    h2, h3 { page-break-after: avoid; }
    table, .callout, .mc, .matching, .math-display { page-break-inside: avoid; }
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
    // Plain-text математику (sqrt(x), 1/2, a^2 и т.п. без $...$) пробуем
    // автоматически обернуть в $...$ перед эскейпом — на случай если AI
    // забыл (промпт это запрещает, но не на 100%).
    return escapeHtml(autowrapPlainMath(s));
}

/**
 * Эвристически оборачивает plain-text математику в $...$ если AI её не обернул.
 * Только для частых паттернов с однозначной интерпретацией.
 *
 * Внутри уже существующих $...$ не трогает ничего — выделяем не-math сегменты
 * и применяем замены только к ним.
 */
function autowrapPlainMath(text: string): string {
    const segments = splitByMath(text);
    return segments.map((seg) => (seg.kind === 'math' ? seg.value : transformPlainSegment(seg.value))).join('');
}

function splitByMath(text: string): Array<{ kind: 'text' | 'math'; value: string }> {
    const out: Array<{ kind: 'text' | 'math'; value: string }> = [];
    let i = 0;
    let buf = '';
    while (i < text.length) {
        // $$…$$
        if (text[i] === '$' && text[i + 1] === '$') {
            const end = text.indexOf('$$', i + 2);
            if (end !== -1) {
                if (buf) { out.push({ kind: 'text', value: buf }); buf = ''; }
                out.push({ kind: 'math', value: text.slice(i, end + 2) });
                i = end + 2;
                continue;
            }
        }
        // $…$
        if (text[i] === '$') {
            const end = text.indexOf('$', i + 1);
            if (end !== -1) {
                if (buf) { out.push({ kind: 'text', value: buf }); buf = ''; }
                out.push({ kind: 'math', value: text.slice(i, end + 1) });
                i = end + 1;
                continue;
            }
        }
        buf += text[i];
        i++;
    }
    if (buf) out.push({ kind: 'text', value: buf });
    return out;
}

function transformPlainSegment(s: string): string {
    let out = s;
    // sqrt(N) → $\sqrt{N}$
    out = out.replace(/\bsqrt\s*\(\s*([^()]+?)\s*\)/g, (_, body) => `$\\sqrt{${body}}$`);
    // N/M → $\frac{N}{M}$
    out = out.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_, a, b) => `$\\frac{${a}}{${b}}$`);
    // a^N → $a^{N}$ (одна буква, число)
    out = out.replace(/\b([a-zA-Z])\^(\d+)\b/g, (_, base, exp) => `$${base}^{${exp}}$`);
    // a_N → $a_{N}$ (одна буква, индекс)
    out = out.replace(/\b([a-zA-Z])_(\d+)\b/g, (_, base, idx) => `$${base}_{${idx}}$`);
    // Угол в градусах: 60° → $60°$
    out = out.replace(/(\d+)\s*°/g, (_, n) => `$${n}°$`);
    // Соседние $..$$..$ → $..\cdot..$
    out = out.replace(/\$([^$]+)\$\s*\$([^$]+)\$/g, (_, a, b) => `$${a} \\cdot ${b}$`);
    return out;
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
            const variantCls = block.variant === 'info' ? '' : ` callout-${block.variant}`;
            return `<div class="callout${variantCls}">${titleHtml}<div class="callout-body">${renderText(block.text)}</div></div>`;
        }
        case 'spacer': {
            const h = block.size === 'sm' ? '8px' : block.size === 'md' ? '20px' : '40px';
            return `<div style="height:${h}"></div>`;
        }
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
                        : `<span class="fill-blank-input">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>`;
                })
                .join('');
            return `<p>${rendered}</p>`;
        }
        case 'multiple-choice': {
            const marker = block.multiple ? 'mc-marker' : 'mc-marker radio';
            const options = block.options
                .map((opt) => {
                    const isCorrect = showAnswers && opt.correct;
                    return `<li class="${isCorrect ? 'correct' : ''}"><span class="${marker}"></span><span>${renderText(opt.text)}${isCorrect ? ' <strong>✓</strong>' : ''}</span></li>`;
                })
                .join('');
            return `<div><p style="font-weight:600;margin-bottom:8px">${renderText(block.question)}</p><ul class="mc-list">${options}</ul></div>`;
        }
        case 'short-answer': {
            const lengthCls = block.expectedLength || 'short';
            const expected = showAnswers && block.expectedAnswer
                ? `<div class="sa-expected"><strong>Ожидаемый ответ:</strong> ${renderText(block.expectedAnswer)}</div>`
                : '';
            return `<div><p style="font-weight:600;margin-bottom:8px">${renderText(block.question)}</p><div class="sa-input ${lengthCls}"></div>${expected}</div>`;
        }
        case 'matching': {
            const correctMap = new Map<string, string>(
                block.pairs.map((p) => [String(p[0]), String(p[1])]),
            );
            const rightList = block.right
                .map((r) => `<li><strong>${escapeHtml(r.id)}.</strong> ${renderText(r.text)}</li>`)
                .join('');
            const leftRows = block.left
                .map((l) => {
                    const correctId = correctMap.get(l.id) || '';
                    const slot = showAnswers
                        ? `<span class="match-answer">${escapeHtml(correctId || '—')}</span>`
                        : `<span class="match-slot">_</span>`;
                    return `<li><strong>${escapeHtml(l.id)}.</strong> ${renderText(l.text)} <span class="match-arrow">→</span> ${slot}</li>`;
                })
                .join('');
            return `<div class="matching-block">
              <p style="font-weight:600;margin-bottom:8px">${renderText(block.instruction)}</p>
              <div class="matching-options"><div class="matching-options-label">Варианты:</div><ul>${rightList}</ul></div>
              <ol class="matching-rows">${leftRows}</ol>
            </div>`;
        }
        case 'html-snippet':
            // Sanitization done at AI-side prompt level. Trust output here.
            return `<div>${block.html.replace(/<script[\s\S]*?<\/script>/gi, '')}</div>`;
        case 'vocab-entry': {
            const transcription = block.transcription
                ? `<span class="vocab-transcription">[${escapeHtml(block.transcription)}]</span>`
                : '';
            const pos = block.partOfSpeech
                ? `<span class="vocab-pos">${escapeHtml(block.partOfSpeech)}</span>`
                : '';
            const example = block.example
                ? `<div class="vocab-example"><span class="vocab-example-label">Пример:</span> <em>${renderText(block.example)}</em>${block.exampleTranslation ? `<span class="vocab-example-tr"> — ${escapeHtml(block.exampleTranslation)}</span>` : ''}</div>`
                : '';
            const note = block.note
                ? `<div class="vocab-note"><span class="vocab-note-label">Примечание:</span> ${escapeHtml(block.note)}</div>`
                : '';
            return `<div class="vocab-entry">
              <div class="vocab-entry-head">
                <span class="vocab-term">${escapeHtml(block.term)}</span>
                ${transcription}
                ${pos}
              </div>
              <div class="vocab-translation">${escapeHtml(block.translation)}</div>
              ${example}
              ${note}
            </div>`;
        }
    }
}

function renderHeader(doc: GenerationDocumentT): string {
    // LOGO_PLACEHOLDER заменяется в HtmlExportService на base64-лого
    // (тот же путь что используется во всех старых HTML-генерациях).
    return `<div class="header">
  <img class="header-logo" src="LOGO_PLACEHOLDER" alt="" />
  <h1>${escapeHtml(doc.title)}</h1>
</div>`;
}

function renderMeta(doc: GenerationDocumentT): string {
    const meta = doc.meta || {};
    const pairs: Array<[string, string]> = [];
    if (meta.subject) pairs.push(['Предмет', meta.subject]);
    if (meta.grade) pairs.push(['Класс', meta.grade]);
    if (meta.duration) pairs.push(['Длительность', meta.duration]);
    if (meta.studentName) pairs.push(['Ученик', meta.studentName]);
    if (meta.date) pairs.push(['Дата', meta.date]);
    if (pairs.length === 0) return '';
    return `<div class="meta-info">${pairs
        .map(([k, v]) => `<span class="meta-info-item"><strong>${escapeHtml(k)}:</strong>${escapeHtml(v)}</span>`)
        .join('')}</div>`;
}

function renderFooter(): string {
    return `<div class="footer-logo"><img src="LOGO_PLACEHOLDER" alt="" /></div>`;
}

/**
 * Группирует плоский список блоков в карточки задач и секции — идентично
 * frontend/DocumentRenderer.tsx (логика синхронизирована при правках).
 */
interface ServerCard { title: string | null; blocks: BlockT[] }
interface ServerSection { title: string | null; cards: ServerCard[] }

function groupBlocks(blocks: BlockT[]): { intro: BlockT[]; sections: ServerSection[] } {
    const intro: BlockT[] = [];
    const sections: ServerSection[] = [];
    let currentSection: ServerSection | null = null;
    let currentCard: ServerCard | null = null;

    const openSection = (title: string | null) => {
        currentSection = { title, cards: [] };
        sections.push(currentSection);
        currentCard = null;
    };
    const openCard = (title: string | null) => {
        if (!currentSection) openSection(null);
        currentCard = { title, blocks: [] };
        currentSection!.cards.push(currentCard);
    };

    for (const block of blocks) {
        if (block.type === 'heading') {
            const text = block.text.trim();
            if (isSectionLikeHeading(text, block.level)) {
                openSection(text);
                continue;
            }
            openCard(text);
            continue;
        }
        if (!currentSection && !currentCard) {
            intro.push(block);
            continue;
        }
        if (!currentCard) openCard(null);
        currentCard!.blocks.push(block);
    }
    return { intro, sections };
}

function isSectionLikeHeading(text: string, level: 1 | 2 | 3): boolean {
    if (level === 1) return true;
    return /^(блок|раздел|часть|секция|глава)\b/i.test(text);
}

function renderGrouped(doc: GenerationDocumentT, showAnswers: boolean): string {
    const grouped = groupBlocks(doc.blocks);
    const introHtml = grouped.intro.length
        ? `<div class="doc-intro">${grouped.intro.map((b) => renderBlock(b, showAnswers)).join('\n')}</div>`
        : '';
    const sectionsHtml = grouped.sections
        .map((section) => {
            const label = section.title
                ? `<div class="section-label">${renderText(section.title)}</div>`
                : '';
            const cardsHtml = section.cards
                .map((card) => {
                    const titleHtml = card.title
                        ? `<div class="task-card-title">${renderText(card.title)}</div>`
                        : '';
                    const bodyHtml = card.blocks.map((b) => renderBlock(b, showAnswers)).join('\n');
                    return `<div class="task-card">${titleHtml}${bodyHtml}</div>`;
                })
                .join('\n');
            return `<div class="doc-section">${label}${cardsHtml}</div>`;
        })
        .join('\n');
    return introHtml + sectionsHtml;
}

/**
 * Главная функция: рендерит документ в полный HTML с DOCTYPE.
 * Готово к скармливанию в Playwright/Chrome для PDF — структура и
 * классы те же, что в DocumentRenderer.tsx и в старом AI-HTML-формате.
 */
export function renderDocumentToHtml(doc: GenerationDocumentT, options: { showAnswers?: boolean } = {}): string {
    const showAnswers = !!options.showAnswers;
    const bodyHtml = renderGrouped(doc, showAnswers);
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
<div class="container">
${renderHeader(doc)}
${renderMeta(doc)}
${bodyHtml}
${renderFooter()}
</div>
</body>
</html>`;
}
