import {
    isAllowedMaterialMime,
    isAllowedMaterialSize,
    MAX_MATERIAL_SIZE_BYTES,
    materialTitleFromFilename,
} from './upload-material.validators';

describe('isAllowedMaterialMime', () => {
    it('принимает PDF', () => {
        expect(isAllowedMaterialMime('application/pdf')).toBe(true);
    });

    it('принимает JPEG', () => {
        expect(isAllowedMaterialMime('image/jpeg')).toBe(true);
    });

    it('принимает PNG', () => {
        expect(isAllowedMaterialMime('image/png')).toBe(true);
    });

    it('отклоняет видео', () => {
        expect(isAllowedMaterialMime('video/mp4')).toBe(false);
    });

    it('отклоняет DOCX', () => {
        expect(isAllowedMaterialMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
    });

    it('отклоняет произвольный binary', () => {
        expect(isAllowedMaterialMime('application/octet-stream')).toBe(false);
    });

    it('терпим к регистру', () => {
        expect(isAllowedMaterialMime('APPLICATION/PDF')).toBe(true);
        expect(isAllowedMaterialMime('Image/JPEG')).toBe(true);
    });
});

describe('isAllowedMaterialSize', () => {
    it('принимает файл 10MB', () => {
        expect(isAllowedMaterialSize(10 * 1024 * 1024)).toBe(true);
    });

    it('принимает файл ровно 50MB', () => {
        expect(isAllowedMaterialSize(MAX_MATERIAL_SIZE_BYTES)).toBe(true);
    });

    it('отклоняет файл 51MB', () => {
        expect(isAllowedMaterialSize(51 * 1024 * 1024)).toBe(false);
    });

    it('отклоняет 0 байт (пустой файл)', () => {
        expect(isAllowedMaterialSize(0)).toBe(false);
    });
});

describe('materialTitleFromFilename', () => {
    it('убирает расширение', () => {
        expect(materialTitleFromFilename('Учебник по алгебре.pdf')).toBe('Учебник по алгебре');
    });

    it('обрезает длинное имя', () => {
        const long = 'a'.repeat(300) + '.pdf';
        const title = materialTitleFromFilename(long);
        expect(title.length).toBeLessThanOrEqual(200);
    });

    it('возвращает «Без названия» если имя пустое', () => {
        expect(materialTitleFromFilename('')).toBe('Без названия');
        expect(materialTitleFromFilename('.pdf')).toBe('Без названия');
    });

    it('терпим к именам без расширения', () => {
        expect(materialTitleFromFilename('README')).toBe('README');
    });
});
