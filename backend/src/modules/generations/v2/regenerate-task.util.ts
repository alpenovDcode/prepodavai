/**
 * Чистые утилиты для перегенерации ОДНОГО задания в blocks-v1 документе.
 *
 * «Задание» = heading-блок + все следующие за ним блоки до следующего
 * heading (любого уровня). Рендерер группирует блоки в карточки ровно так же.
 */

export interface RawBlock {
    type: string;
    id?: string;
    [k: string]: any;
}

/**
 * Диапазон блоков задания по id его heading'а.
 * Возвращает { start, end } (включительно) или null, если headingId
 * не найден или это не heading.
 */
export function extractTaskRange(
    blocks: RawBlock[],
    headingId: string,
): { start: number; end: number } | null {
    const start = blocks.findIndex(
        (b) => b.id === headingId && b.type === 'heading',
    );
    if (start < 0) return null;
    let end = start;
    for (let i = start + 1; i < blocks.length; i++) {
        if (blocks[i].type === 'heading') break;
        end = i;
    }
    return { start, end };
}

/** Заменяет диапазон [start..end] на newBlocks, остальное сохраняет. */
export function replaceTaskRange(
    blocks: RawBlock[],
    start: number,
    end: number,
    newBlocks: RawBlock[],
): RawBlock[] {
    return [...blocks.slice(0, start), ...newBlocks, ...blocks.slice(end + 1)];
}

/**
 * Присваивает блокам свежие уникальные id, не пересекающиеся с existingIds.
 * Всегда перезаписывает id (входящие от LLM могут дублировать существующие).
 */
export function reassignBlockIds(
    newBlocks: RawBlock[],
    existingIds: Iterable<string>,
    prefix = 'rg',
): RawBlock[] {
    const used = new Set<string>(existingIds);
    let counter = 0;
    const nextId = (): string => {
        let id: string;
        do {
            id = `${prefix}-${++counter}`;
        } while (used.has(id));
        used.add(id);
        return id;
    };
    return newBlocks.map((b) => ({ ...b, id: nextId() }));
}

/** Собирает все id блоков документа (для проверки коллизий). */
export function collectIds(blocks: RawBlock[]): Set<string> {
    const s = new Set<string>();
    for (const b of blocks) if (b.id) s.add(b.id);
    return s;
}

/**
 * Парсит блоки задания из ответа LLM. Терпим ко всем формам, которые
 * реально возвращает модель на «одно задание»:
 *   - массив [ {...}, {...} ]
 *   - объект-обёртка { "blocks": [ ... ] }
 *   - ОДИНОЧНЫЙ блок { "type": "multiple-choice", ... }  (частый случай)
 *   - с markdown-fence ```json ... ``` и/или пояснительным текстом до/после.
 */
export function parseBlocksArray(raw: string): RawBlock[] {
    let s = (raw || '').trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    }

    const tryParse = (str: string): any => {
        try {
            return JSON.parse(str);
        } catch {
            return undefined;
        }
    };
    const normalize = (val: any): RawBlock[] => {
        if (Array.isArray(val)) return val as RawBlock[];
        if (val && Array.isArray(val.blocks)) return val.blocks as RawBlock[];
        if (val && typeof val.type === 'string') return [val as RawBlock];
        return [];
    };
    // «Хороший» кандидат — непустой, где у ВСЕХ элементов есть type
    // (настоящие блоки). Отсекает случай, когда вырезка [ ... ] случайно
    // захватила вложенный массив options[] вместо тела задания.
    const good = (arr: RawBlock[]): boolean =>
        arr.length > 0 && arr.every((b) => b && typeof b.type === 'string');

    // Собираем кандидатов: весь стринг, top-level массив, top-level объект.
    const candidates: RawBlock[][] = [];
    candidates.push(normalize(tryParse(s)));

    const fb = s.indexOf('[');
    const lb = s.lastIndexOf(']');
    if (fb >= 0 && lb > fb) candidates.push(normalize(tryParse(s.slice(fb, lb + 1))));

    const fbr = s.indexOf('{');
    const lbr = s.lastIndexOf('}');
    if (fbr >= 0 && lbr > fbr) candidates.push(normalize(tryParse(s.slice(fbr, lbr + 1))));

    return (
        candidates.find(good) ??
        candidates.find((c) => c.length > 0) ??
        []
    );
}
