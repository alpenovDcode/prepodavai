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
