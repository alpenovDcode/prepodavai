import {
    validateBlocksContent,
    fixBlocksContent,
    countWorksheetTaskCards,
    type ContentIssue,
} from './blocks-content-validator';
import type { GenerationDocumentT } from './blocks-schema';

function docWithBlocks(blocks: any[], docType: GenerationDocumentT['type'] = 'worksheet'): GenerationDocumentT {
    return {
        schemaVersion: 1,
        type: docType,
        title: 'T',
        meta: {},
        blocks,
    } as GenerationDocumentT;
}

function taskHeading(n: number, name = 'Задача'): any {
    return { type: 'heading', id: `h-${n}`, level: 2, text: `Задание ${n}. ${name}` };
}
function sectionHeading(n: number, name = 'Подтема'): any {
    return { type: 'heading', id: `h-s${n}`, level: 2, text: `Блок ${n}: ${name}` };
}
function fillBlank(id: string): any {
    return { type: 'fill-blank', id, template: 'X = {{1}}', blanks: [{ index: 1, answer: '1' }] };
}

describe('validateBlocksContent', () => {
    it('возвращает пустой массив для чистого документа', () => {
        const doc = docWithBlocks([
            { type: 'paragraph', id: 'p-1', text: 'Формула $a^2 + b^2 = c^2$ известна.' },
            { type: 'fill-blank', id: 'fb-1', template: 'Площадь = {{1}}', blanks: [{ index: 1, answer: '50' }] },
        ]);
        expect(validateBlocksContent(doc)).toEqual([]);
    });

    it('находит {{N}} внутри $...$ в fill-blank.template', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: "$f'({{1}}) = \\tan({{2}})$",
                blanks: [
                    { index: 1, answer: 'x_0' },
                    { index: 2, answer: '\\alpha' },
                ],
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('placeholder_in_formula');
        expect(issues[0].path).toContain('fb-1');
        expect(issues[0].path).toContain('template');
    });

    it('находит {{N}} внутри display $$...$$', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-2',
                template: '$$\\int_0^{{1}} x dx$$',
                blanks: [{ index: 1, answer: '1' }],
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('placeholder_in_formula');
    });

    it('находит нечётное число $ в paragraph.text', () => {
        const doc = docWithBlocks([
            { type: 'paragraph', id: 'p-1', text: 'Возьмём $a + b и продолжим.' },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('unbalanced_dollars');
        expect(issues[0].path).toContain('p-1');
    });

    it('находит проблему в callout.text', () => {
        const doc = docWithBlocks([
            {
                type: 'callout',
                id: 'c-1',
                variant: 'info',
                text: 'Решение: $x = {{1}}$',
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('placeholder_in_formula');
    });

    it('находит проблему в multiple-choice.options[].text', () => {
        const doc = docWithBlocks([
            {
                type: 'multiple-choice',
                id: 'mc-1',
                question: 'Выбери:',
                multiple: false,
                options: [
                    { id: 'a', text: '$x = {{1}}$', correct: true },
                    { id: 'b', text: '$x = 2$', correct: false },
                ],
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues.length).toBeGreaterThanOrEqual(1);
        expect(issues[0].path).toContain('mc-1');
        expect(issues[0].path).toContain('options');
    });

    it('находит проблему в short-answer.expectedAnswer', () => {
        const doc = docWithBlocks([
            {
                type: 'short-answer',
                id: 'sa-1',
                question: 'Найди x:',
                expectedAnswer: '$x = {{1}}$',
                expectedLength: 'short',
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues.length).toBeGreaterThanOrEqual(1);
        expect(issues[0].path).toContain('sa-1');
    });

    it('находит проблему в matching.left[].text', () => {
        const doc = docWithBlocks([
            {
                type: 'matching',
                id: 'm-1',
                instruction: 'Сопоставь:',
                left: [
                    { id: '1', text: '$x = {{1}}$' },
                    { id: '2', text: '$x = 2$' },
                ],
                right: [
                    { id: 'a', text: 'A' },
                    { id: 'b', text: 'B' },
                ],
                pairs: [['1', 'a'], ['2', 'b']],
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues.length).toBeGreaterThanOrEqual(1);
        expect(issues[0].path).toContain('m-1');
    });

    it('находит проблему в table.rows', () => {
        const doc = docWithBlocks([
            {
                type: 'table',
                id: 't-1',
                headers: ['Формула', 'Значение'],
                rows: [['$x = {{1}}$', '5']],
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues.length).toBeGreaterThanOrEqual(1);
        expect(issues[0].path).toContain('t-1');
    });

    it('выдаёт читаемый excerpt с нарушающим фрагментом', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: "Текст до. $f'({{1}}) = 0$ Текст после.",
                blanks: [{ index: 1, answer: 'x' }],
            },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues[0].excerpt).toContain('{{1}}');
        expect(issues[0].excerpt).toContain('$');
    });

    it('не помечает {{N}} вне формулы как проблему', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: 'Площадь = {{1}}, периметр = {{2}}.',
                blanks: [
                    { index: 1, answer: '50' },
                    { index: 2, answer: '30' },
                ],
            },
        ]);
        expect(validateBlocksContent(doc)).toEqual([]);
    });

    it('не считает экранированный \\$ в LaTeX за разделитель формулы', () => {
        // Цена $10 USD внутри обычного текста — нечётный $.
        // Здесь мы пишем чисто один $ — это unbalanced.
        const doc = docWithBlocks([
            { type: 'paragraph', id: 'p-1', text: 'Цена $10.' },
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('unbalanced_dollars');
    });
});

describe('fixBlocksContent', () => {
    it('идемпотентен на чистом документе (не меняет структуру)', () => {
        const doc = docWithBlocks([
            { type: 'paragraph', id: 'p-1', text: 'Формула $a^2 + b^2 = c^2$.' },
            { type: 'fill-blank', id: 'fb-1', template: 'Площадь = {{1}}', blanks: [{ index: 1, answer: '50' }] },
        ]);
        const fixed = fixBlocksContent(doc);
        expect(fixed.blocks).toEqual(doc.blocks);
        expect(validateBlocksContent(fixed)).toEqual([]);
    });

    it('разрывает $f\'({{1}}) = \\tan({{2}})$ на сегменты', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: "$f'({{1}}) = \\tan({{2}})$",
                blanks: [
                    { index: 1, answer: 'x_0' },
                    { index: 2, answer: '\\alpha' },
                ],
            },
        ]);
        const fixed = fixBlocksContent(doc);
        const fb = fixed.blocks[0] as any;
        // Главное: НЕТ {{N}} внутри пары $..$, и есть валидный math для f' и \tan.
        expect(validateBlocksContent(fixed)).toEqual([]);
        expect(fb.template).toContain("$f'($");
        expect(fb.template).toContain('$) = \\tan($');
        expect(fb.template).toContain('$)$');
        expect(fb.template).toContain('{{1}}');
        expect(fb.template).toContain('{{2}}');
    });

    it('разрывает $\\alpha = {{1}}°$ и сохраняет греческую букву', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: '$\\alpha = {{1}}°$',
                blanks: [{ index: 1, answer: '45' }],
            },
        ]);
        const fixed = fixBlocksContent(doc);
        const fb = fixed.blocks[0] as any;
        expect(validateBlocksContent(fixed)).toEqual([]);
        expect(fb.template).toContain('\\alpha');
        expect(fb.template).toContain('°');
        expect(fb.template).toContain('{{1}}');
    });

    it('обрабатывает display $$...{{N}}...$$', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: '$$\\int_0^{{1}} x \\, dx$$',
                blanks: [{ index: 1, answer: '1' }],
            },
        ]);
        const fixed = fixBlocksContent(doc);
        expect(validateBlocksContent(fixed)).toEqual([]);
    });

    it('удаляет висячий непарный $ в paragraph.text', () => {
        const doc = docWithBlocks([
            { type: 'paragraph', id: 'p-1', text: 'Возьмём $a + b и продолжим.' },
        ]);
        const fixed = fixBlocksContent(doc);
        const para = fixed.blocks[0] as any;
        expect(validateBlocksContent(fixed)).toEqual([]);
        // Знак $ выпиливаем, текст сохраняем.
        expect(para.text).not.toContain('$');
        expect(para.text).toContain('a + b');
    });

    it('чинит проблему в multiple-choice.options[].text', () => {
        const doc = docWithBlocks([
            {
                type: 'multiple-choice',
                id: 'mc-1',
                question: 'Выбери:',
                multiple: false,
                options: [
                    { id: 'a', text: '$x = {{1}}$', correct: true },
                    { id: 'b', text: '$x = 2$', correct: false },
                ],
            },
        ]);
        const fixed = fixBlocksContent(doc);
        expect(validateBlocksContent(fixed)).toEqual([]);
    });

    it('пропускает пустые сегменты вокруг {{N}} (не плодит лишние пустые $$)', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: '${{1}}$',
                blanks: [{ index: 1, answer: '5' }],
            },
        ]);
        const fixed = fixBlocksContent(doc);
        const fb = fixed.blocks[0] as any;
        expect(validateBlocksContent(fixed)).toEqual([]);
        // Не должно быть пустой пары $$.
        expect(fb.template).not.toMatch(/\$\s*\$/);
        expect(fb.template).toContain('{{1}}');
    });

    it('сохраняет чистую формулу без {{N}} в той же строке', () => {
        const doc = docWithBlocks([
            {
                type: 'fill-blank',
                id: 'fb-1',
                template: 'Дано: $a = 5$. Найди $b = {{1}}$.',
                blanks: [{ index: 1, answer: '7' }],
            },
        ]);
        const fixed = fixBlocksContent(doc);
        const fb = fixed.blocks[0] as any;
        expect(validateBlocksContent(fixed)).toEqual([]);
        // $a = 5$ должен остаться нетронутым.
        expect(fb.template).toContain('$a = 5$');
        expect(fb.template).toContain('{{1}}');
    });
});

describe('countWorksheetTaskCards', () => {
    it('считает heading level 2 с текстом «Задание N. ...»', () => {
        const doc = docWithBlocks([
            taskHeading(1),
            fillBlank('fb-1'),
            taskHeading(2),
            fillBlank('fb-2'),
            taskHeading(3),
            fillBlank('fb-3'),
        ]);
        expect(countWorksheetTaskCards(doc)).toBe(3);
    });

    it('не считает секции-разделители «Блок N: ...»', () => {
        const doc = docWithBlocks([
            sectionHeading(1),
            taskHeading(1),
            taskHeading(2),
            sectionHeading(2),
            taskHeading(3),
        ]);
        expect(countWorksheetTaskCards(doc)).toBe(3);
    });

    it('не считает «Задание» в heading других уровней', () => {
        const doc = docWithBlocks([
            { type: 'heading', id: 'h-1', level: 1, text: 'Задание 1. Hello' },
            { type: 'heading', id: 'h-2', level: 3, text: 'Задание 2. World' },
        ]);
        expect(countWorksheetTaskCards(doc)).toBe(0);
    });

    it('терпим к двоеточию вместо точки («Задание 1: …»)', () => {
        const doc = docWithBlocks([
            { type: 'heading', id: 'h-1', level: 2, text: 'Задание 1: Что-то' },
            { type: 'heading', id: 'h-2', level: 2, text: 'Задание 2 Что-то' },
        ]);
        expect(countWorksheetTaskCards(doc)).toBe(2);
    });
});

describe('validateBlocksContent с expectedTaskCount', () => {
    it('не выдаёт issue если фактическое число задач === ожидаемое', () => {
        const doc = docWithBlocks([
            taskHeading(1), fillBlank('fb-1'),
            taskHeading(2), fillBlank('fb-2'),
            taskHeading(3), fillBlank('fb-3'),
        ]);
        const issues = validateBlocksContent(doc, { expectedTaskCount: 3 });
        expect(issues).toEqual([]);
    });

    it('выдаёт task_count_mismatch если фактическое меньше ожидаемого', () => {
        const doc = docWithBlocks([
            taskHeading(1), fillBlank('fb-1'),
            taskHeading(2), fillBlank('fb-2'),
        ]);
        const issues = validateBlocksContent(doc, { expectedTaskCount: 13 });
        expect(issues).toHaveLength(1);
        expect(issues[0].code).toBe('task_count_mismatch');
        expect(issues[0].suggestion).toContain('13');
        expect(issues[0].suggestion).toContain('2');
        expect(issues[0].suggestion).toMatch(/добавь|ещё|11/i);
    });

    it('терпим к небольшому перебору (фактическое > ожидаемого ≤ +3)', () => {
        // LLM может слегка перебрать — это не критично, не реджектим.
        const doc = docWithBlocks([
            taskHeading(1), fillBlank('fb-1'),
            taskHeading(2), fillBlank('fb-2'),
            taskHeading(3), fillBlank('fb-3'),
            taskHeading(4), fillBlank('fb-4'),
        ]);
        const issues = validateBlocksContent(doc, { expectedTaskCount: 3 });
        expect(issues).toEqual([]);
    });

    it('срабатывает только для type === worksheet', () => {
        // Если для quiz/vocabulary случайно передан expectedTaskCount — игнорируем.
        const quizDoc = docWithBlocks([
            { type: 'heading', id: 'h-1', level: 2, text: 'Вопрос 1' },
        ], 'quiz');
        const issues = validateBlocksContent(quizDoc, { expectedTaskCount: 10 });
        expect(issues.filter(i => i.code === 'task_count_mismatch')).toEqual([]);
    });

    it('без expectedTaskCount счётчик не запускается', () => {
        const doc = docWithBlocks([
            taskHeading(1), fillBlank('fb-1'),
        ]);
        const issues = validateBlocksContent(doc);
        expect(issues.filter(i => i.code === 'task_count_mismatch')).toEqual([]);
    });
});
