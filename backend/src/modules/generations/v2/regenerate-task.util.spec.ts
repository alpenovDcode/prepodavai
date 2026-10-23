import {
    extractTaskRange,
    replaceTaskRange,
    reassignBlockIds,
    collectIds,
    parseBlocksArray,
    RawBlock,
} from './regenerate-task.util';

const doc: RawBlock[] = [
    { type: 'paragraph', id: 'p-intro', text: 'Вступление' },
    { type: 'heading', id: 'h-1', level: 2, text: 'Задание 1' },
    { type: 'paragraph', id: 'p-1', text: 'Условие 1' },
    { type: 'short-answer', id: 'sa-1', question: 'Ответ:' },
    { type: 'heading', id: 'h-2', level: 2, text: 'Задание 2' },
    { type: 'multiple-choice', id: 'mc-2', question: 'Выбери' },
    { type: 'heading', id: 'h-3', level: 2, text: 'Задание 3' },
    { type: 'fill-blank', id: 'fb-3', template: '{{1}}' },
];

describe('extractTaskRange', () => {
    it('находит диапазон задания в середине (heading + блоки до следующего heading)', () => {
        expect(extractTaskRange(doc, 'h-1')).toEqual({ start: 1, end: 3 });
    });

    it('находит диапазон последнего задания (до конца массива)', () => {
        expect(extractTaskRange(doc, 'h-3')).toEqual({ start: 6, end: 7 });
    });

    it('задание из одного heading без тела → start=end', () => {
        expect(extractTaskRange(doc, 'h-2')).toEqual({ start: 4, end: 5 });
    });

    it('null если id не найден', () => {
        expect(extractTaskRange(doc, 'nope')).toBeNull();
    });

    it('null если id принадлежит не-heading', () => {
        expect(extractTaskRange(doc, 'p-1')).toBeNull();
    });
});

describe('replaceTaskRange', () => {
    it('заменяет диапазон, сохраняя остальное', () => {
        const next = replaceTaskRange(doc, 1, 3, [
            { type: 'heading', id: 'x', level: 2, text: 'Новое 1' },
            { type: 'paragraph', id: 'y', text: 'Новое условие' },
        ]);
        expect(next.map((b) => b.id)).toEqual([
            'p-intro', 'x', 'y', 'h-2', 'mc-2', 'h-3', 'fb-3',
        ]);
    });

    it('замена последнего задания', () => {
        const next = replaceTaskRange(doc, 6, 7, [{ type: 'heading', id: 'z', level: 2, text: 'Задание 3 v2' }]);
        expect(next[next.length - 1].id).toBe('z');
        expect(next).toHaveLength(7);
    });
});

describe('reassignBlockIds', () => {
    it('присваивает уникальные id, не пересекающиеся с существующими', () => {
        const existing = new Set(['rg-1', 'rg-2']);
        const out = reassignBlockIds(
            [{ type: 'heading', id: 'dup' }, { type: 'paragraph', id: 'dup' }],
            existing,
        );
        const ids = out.map((b) => b.id);
        expect(ids).toEqual(['rg-3', 'rg-4']); // rg-1, rg-2 заняты
        expect(new Set(ids).size).toBe(2); // уникальны
    });

    it('перезаписывает даже валидные входящие id', () => {
        const out = reassignBlockIds([{ type: 'heading', id: 'keep-me' }], new Set());
        expect(out[0].id).toBe('rg-1');
    });
});

describe('collectIds', () => {
    it('собирает все id документа', () => {
        expect(collectIds(doc).has('h-2')).toBe(true);
        expect(collectIds(doc).size).toBe(8);
    });
});

describe('parseBlocksArray', () => {
    it('массив блоков', () => {
        const r = parseBlocksArray('[{"type":"paragraph","text":"a"},{"type":"short-answer"}]');
        expect(r).toHaveLength(2);
        expect(r[0].type).toBe('paragraph');
    });

    it('ОДИНОЧНЫЙ объект-блок → оборачивается в массив (главный кейс бага)', () => {
        const r = parseBlocksArray('{"type":"multiple-choice","question":"?","options":[]}');
        expect(r).toHaveLength(1);
        expect(r[0].type).toBe('multiple-choice');
    });

    it('обёртка { blocks: [...] }', () => {
        const r = parseBlocksArray('{"blocks":[{"type":"paragraph"},{"type":"fill-blank"}]}');
        expect(r).toHaveLength(2);
    });

    it('markdown-fence ```json ... ```', () => {
        const r = parseBlocksArray('```json\n[{"type":"paragraph","text":"x"}]\n```');
        expect(r).toHaveLength(1);
    });

    it('пояснительный текст до массива', () => {
        const r = parseBlocksArray('Вот новый вариант:\n[{"type":"short-answer","question":"?"}]');
        expect(r).toHaveLength(1);
        expect(r[0].type).toBe('short-answer');
    });

    it('пояснительный текст до одиночного объекта', () => {
        const r = parseBlocksArray('Готово: {"type":"multiple-choice","options":[{"id":"a"}]}');
        expect(r).toHaveLength(1);
        expect(r[0].type).toBe('multiple-choice');
    });

    it('пусто/мусор → []', () => {
        expect(parseBlocksArray('')).toEqual([]);
        expect(parseBlocksArray('бла-бла без json')).toEqual([]);
    });
});
