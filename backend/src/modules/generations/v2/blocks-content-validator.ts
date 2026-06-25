import type { GenerationDocumentT, BlockT } from './blocks-schema';

/**
 * Content-валидация и авто-фикс для блоков blocks-v1.
 *
 * Дополняет Zod-валидацию (которая проверяет только структуру JSON)
 * проверкой контента строковых полей: формулы $..$, плейсхолдеры {{N}}.
 *
 * Главный кейс — LLM нарушает правило «{{N}} нельзя внутри $..$»
 * (см. prompts.ts блок #3). Тогда фронт-парсер splitMath() в Math.tsx
 * рвёт пару $ и часть LaTeX уходит сырым текстом в карточку задания.
 *
 * Pipeline:
 *   1. validateBlocksContent() → список нарушений (по полям)
 *      → используется как feedback для LLM-retry.
 *   2. fixBlocksContent() → детерминистский last-resort auto-fix
 *      по стратегии A (см. ниже).
 */

export type ContentIssue = {
    /** Читаемый путь до поля, например `blocks[2] (fill-blank fb-1).template`. */
    path: string;
    code: 'placeholder_in_formula' | 'unbalanced_dollars' | 'task_count_mismatch';
    /** Нарушающий фрагмент из строки (для подсказки LLM). */
    excerpt: string;
    /** Что LLM нужно сделать. */
    suggestion: string;
};

export type ValidateOptions = {
    /**
     * Сколько карточек-заданий («Задание N. ...» heading level 2)
     * должно быть в документе. Срабатывает только для type='worksheet'.
     * Допускается небольшой перебор, но НЕдоборы выдают issue.
     */
    expectedTaskCount?: number;
};

// ─── валидатор ────────────────────────────────────────────────────

export function validateBlocksContent(
    doc: GenerationDocumentT,
    opts: ValidateOptions = {},
): ContentIssue[] {
    const issues: ContentIssue[] = [];
    doc.blocks.forEach((block, idx) => {
        const base = `blocks[${idx}] (${block.type} ${block.id})`;
        for (const field of textFieldsOf(block)) {
            checkString(field.value, `${base}.${field.name}`, issues);
        }
    });
    if (opts.expectedTaskCount !== undefined && doc.type === 'worksheet') {
        const actual = countWorksheetTaskCards(doc);
        const expected = opts.expectedTaskCount;
        if (actual < expected) {
            const missing = expected - actual;
            issues.push({
                path: 'blocks (worksheet root)',
                code: 'task_count_mismatch',
                excerpt: `Найдено ${actual} карточек-заданий, ожидалось ${expected}.`,
                suggestion:
                    `Не хватает ${missing} заданий. ` +
                    `Добавь ещё ${missing} карточек по схеме: ` +
                    `heading level 2 «Задание N. <название>» + интерактивный блок ` +
                    `(fill-blank / multiple-choice / short-answer / matching). ` +
                    `Итого должно быть РОВНО ${expected} карточек «Задание N. ...».`,
            });
        }
    }
    return issues;
}

const TASK_CARD_RE = /^Задание\s+\d+/;

/**
 * Считает heading level 2 с текстом, начинающимся с «Задание N» —
 * именно так промпт worksheet просит оформлять карточки задач.
 * Секции-разделители («Блок N: ...», «Раздел …», «Часть …») не учитываются.
 */
export function countWorksheetTaskCards(doc: GenerationDocumentT): number {
    let n = 0;
    for (const b of doc.blocks) {
        if (b.type === 'heading' && b.level === 2 && TASK_CARD_RE.test(b.text)) {
            n++;
        }
    }
    return n;
}

function checkString(s: string, path: string, out: ContentIssue[]): void {
    const ranges = findFormulaRanges(s);
    for (const r of ranges) {
        if (PLACEHOLDER_RE.test(r.body)) {
            out.push({
                path,
                code: 'placeholder_in_formula',
                excerpt: s.slice(r.start, r.end),
                suggestion:
                    'Маркер {{N}} нельзя помещать между $...$ или $$...$$ — рендерер ломается. ' +
                    'Перепиши: либо вынеси {{N}} за пределы формулы, либо разбей блок на math-display сверху и fill-blank снизу.',
            });
        }
    }
    if (hasUnbalancedDollars(s)) {
        out.push({
            path,
            code: 'unbalanced_dollars',
            excerpt: snippetAround(s, s.indexOf('$')),
            suggestion:
                'Нечётное число знаков $ — открывающий $ без закрывающей пары. ' +
                'Либо закрой формулу, либо экранируй знак валюты как «10 ₽».',
        });
    }
}

const PLACEHOLDER_RE = /\{\{\d+\}\}/;

function snippetAround(s: string, pos: number, window = 30): string {
    if (pos < 0) return s.slice(0, Math.min(window, s.length));
    const start = Math.max(0, pos - window);
    const end = Math.min(s.length, pos + window);
    return s.slice(start, end);
}

function hasUnbalancedDollars(s: string): boolean {
    let i = 0;
    let pairs = 0;
    let unbalanced = 0;
    while (i < s.length) {
        if (s[i] === '$' && s[i + 1] === '$') {
            const end = s.indexOf('$$', i + 2);
            if (end !== -1) {
                pairs++;
                i = end + 2;
                continue;
            }
            unbalanced++;
            i += 2;
            continue;
        }
        if (s[i] === '$') {
            const end = s.indexOf('$', i + 1);
            if (end !== -1) {
                pairs++;
                i = end + 1;
                continue;
            }
            unbalanced++;
            i++;
            continue;
        }
        i++;
    }
    return unbalanced > 0;
}

type FormulaRange = { start: number; end: number; body: string; display: boolean };

function findFormulaRanges(s: string): FormulaRange[] {
    const ranges: FormulaRange[] = [];
    let i = 0;
    while (i < s.length) {
        if (s[i] === '$' && s[i + 1] === '$') {
            const end = s.indexOf('$$', i + 2);
            if (end !== -1) {
                ranges.push({ start: i, end: end + 2, body: s.slice(i + 2, end), display: true });
                i = end + 2;
                continue;
            }
        }
        if (s[i] === '$') {
            const end = s.indexOf('$', i + 1);
            if (end !== -1) {
                ranges.push({ start: i, end: end + 1, body: s.slice(i + 1, end), display: false });
                i = end + 1;
                continue;
            }
        }
        i++;
    }
    return ranges;
}

// ─── авто-фикс ────────────────────────────────────────────────────

export function fixBlocksContent(doc: GenerationDocumentT): GenerationDocumentT {
    return {
        ...doc,
        blocks: doc.blocks.map(b => fixBlock(b)),
    };
}

function fixBlock(block: BlockT): BlockT {
    switch (block.type) {
        case 'paragraph':
            return { ...block, text: fixString(block.text) };
        case 'heading':
            return { ...block, text: fixString(block.text) };
        case 'callout':
            return {
                ...block,
                text: fixString(block.text),
                ...(block.title !== undefined ? { title: fixString(block.title) } : {}),
            };
        case 'fill-blank':
            return { ...block, template: fixString(block.template) };
        case 'multiple-choice':
            return {
                ...block,
                question: fixString(block.question),
                options: block.options.map(o => ({ ...o, text: fixString(o.text) })),
            };
        case 'short-answer':
            return {
                ...block,
                question: fixString(block.question),
                ...(block.expectedAnswer !== undefined
                    ? { expectedAnswer: fixString(block.expectedAnswer) }
                    : {}),
            };
        case 'matching':
            return {
                ...block,
                instruction: fixString(block.instruction),
                left: block.left.map(x => ({ ...x, text: fixString(x.text) })),
                right: block.right.map(x => ({ ...x, text: fixString(x.text) })),
            };
        case 'table':
            return {
                ...block,
                headers: block.headers.map(fixString),
                rows: block.rows.map(r => r.map(fixString)),
                ...(block.caption !== undefined ? { caption: fixString(block.caption) } : {}),
            };
        case 'vocab-entry':
        case 'math-display':
        case 'spacer':
        case 'image':
        case 'html-snippet':
            return block;
    }
}

/**
 * Стратегия A: для каждой пары $..$ или $$..$$ содержащей {{N}}
 * разрываем формулу на сегменты — math-части остаются в $..$,
 * placeholder выносится наружу.
 *
 * Плюс: удаляем висячий непарный $ (как делает фронт-парсер
 * в Math.tsx, но раньше — сразу на сервере, чтобы текст уже
 * был чистым).
 */
function fixString(s: string): string {
    const out: string[] = [];
    let i = 0;
    while (i < s.length) {
        // display $$..$$
        if (s[i] === '$' && s[i + 1] === '$') {
            const end = s.indexOf('$$', i + 2);
            if (end !== -1) {
                const body = s.slice(i + 2, end);
                out.push(rebuildFormula(body, '$$'));
                i = end + 2;
                continue;
            }
            // Висячая пара $$ — выкидываем оба знака.
            i += 2;
            continue;
        }
        // inline $..$
        if (s[i] === '$') {
            const end = s.indexOf('$', i + 1);
            if (end !== -1) {
                const body = s.slice(i + 1, end);
                out.push(rebuildFormula(body, '$'));
                i = end + 1;
                continue;
            }
            // Висячий одинокий $ — выкидываем.
            i++;
            continue;
        }
        out.push(s[i]);
        i++;
    }
    return out.join('');
}

/**
 * Если body не содержит {{N}} — возвращаем оригинальную формулу
 * как есть. Иначе разбиваем по placeholder'ам и оборачиваем каждый
 * math-сегмент в свою пару delim.
 */
function rebuildFormula(body: string, delim: '$' | '$$'): string {
    if (!PLACEHOLDER_RE.test(body)) {
        return `${delim}${body}${delim}`;
    }
    const parts = body.split(/(\{\{\d+\}\})/g);
    return parts
        .map(p => {
            if (/^\{\{\d+\}\}$/.test(p)) return p;
            if (!p) return '';
            if (!p.trim()) return p; // сохраняем чистые пробелы как есть
            return `${delim}${p}${delim}`;
        })
        .join('');
}

// ─── обход полей блока ────────────────────────────────────────────

type StringField = { name: string; value: string };

function textFieldsOf(block: BlockT): StringField[] {
    const fields: StringField[] = [];
    switch (block.type) {
        case 'paragraph':
            fields.push({ name: 'text', value: block.text });
            break;
        case 'heading':
            fields.push({ name: 'text', value: block.text });
            break;
        case 'callout':
            fields.push({ name: 'text', value: block.text });
            if (block.title) fields.push({ name: 'title', value: block.title });
            break;
        case 'fill-blank':
            fields.push({ name: 'template', value: block.template });
            block.blanks.forEach((b, i) => {
                if (b.answer) fields.push({ name: `blanks[${i}].answer`, value: b.answer });
                if (b.hint) fields.push({ name: `blanks[${i}].hint`, value: b.hint });
            });
            break;
        case 'multiple-choice':
            fields.push({ name: 'question', value: block.question });
            block.options.forEach((o, i) => {
                fields.push({ name: `options[${i}].text`, value: o.text });
            });
            break;
        case 'short-answer':
            fields.push({ name: 'question', value: block.question });
            if (block.expectedAnswer) {
                fields.push({ name: 'expectedAnswer', value: block.expectedAnswer });
            }
            break;
        case 'matching':
            fields.push({ name: 'instruction', value: block.instruction });
            block.left.forEach((x, i) => fields.push({ name: `left[${i}].text`, value: x.text }));
            block.right.forEach((x, i) => fields.push({ name: `right[${i}].text`, value: x.text }));
            break;
        case 'table':
            block.headers.forEach((h, i) => fields.push({ name: `headers[${i}]`, value: h }));
            block.rows.forEach((row, ri) => {
                row.forEach((c, ci) => fields.push({ name: `rows[${ri}][${ci}]`, value: c }));
            });
            if (block.caption) fields.push({ name: 'caption', value: block.caption });
            break;
        case 'math-display':
            // latex здесь — содержимое формулы БЕЗ $. Внутри быть {{N}} не должно.
            // Проверяем напрямую как «тело формулы».
            if (PLACEHOLDER_RE.test(block.latex)) {
                fields.push({ name: 'latex (внутри display)', value: `$$${block.latex}$$` });
            }
            break;
        case 'vocab-entry':
        case 'image':
        case 'spacer':
        case 'html-snippet':
            break;
    }
    return fields;
}

// ─── удобный форматтер для retry-prompt ──────────────────────────

export function formatContentIssues(issues: ContentIssue[]): string {
    return issues
        .map(
            (i, n) =>
                `${n + 1}. [${i.code}] ${i.path}\n   Фрагмент: ${i.excerpt}\n   Что сделать: ${i.suggestion}`,
        )
        .join('\n\n');
}
