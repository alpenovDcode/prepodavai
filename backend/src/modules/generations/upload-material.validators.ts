/**
 * Валидаторы для загрузки пользовательских материалов.
 *
 * Этап 1: разрешены только PDF + картинки (JPG/PNG), ≤50MB.
 * Тип файла валидируется по mime, не по расширению (хотя
 * FilesService дополнительно проверяет расширение из whitelist).
 *
 * Лимит 50MB выбран намеренно ниже общего лимита FilesService
 * (2GB для видео): большой учебник в PDF редко превышает 30MB,
 * фото страницы — единицы MB.
 */

const ALLOWED_MIMES = new Set<string>([
    'application/pdf',
    'image/jpeg',
    'image/png',
]);

export const MAX_MATERIAL_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export function isAllowedMaterialMime(mime: string): boolean {
    if (!mime) return false;
    return ALLOWED_MIMES.has(mime.toLowerCase());
}

export function isAllowedMaterialSize(bytes: number): boolean {
    return bytes > 0 && bytes <= MAX_MATERIAL_SIZE_BYTES;
}

/**
 * Делает разумный title из имени файла: убирает расширение,
 * подрезает до 200 символов, фолбэк «Без названия».
 */
export function materialTitleFromFilename(filename: string): string {
    if (!filename) return 'Без названия';
    const dot = filename.lastIndexOf('.');
    // dot === 0 ('.pdf') — это файл без имени, не «.pdf» как название.
    const base = dot > 0 ? filename.slice(0, dot) : dot === 0 ? '' : filename;
    const trimmed = base.trim();
    if (!trimmed) return 'Без названия';
    return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}
