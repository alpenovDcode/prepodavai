import { buildWorksheetPrompt, buildQuizPrompt } from './prompts';

/**
 * Тесты директив, которые управляют промптом от полей формы:
 * сложность (легко/средне/сложно), тип заданий, свободные пожелания.
 */

describe('buildWorksheetPrompt', () => {
    it('без difficulty — нет строки про уровень сложности', () => {
        const { user } = buildWorksheetPrompt({ topic: 'Дроби' });
        expect(user).not.toMatch(/Уровень сложности/i);
    });

    it('difficulty=easy → лёгкий уровень в user-промпте', () => {
        const { user } = buildWorksheetPrompt({ topic: 'Дроби', difficulty: 'easy' });
        expect(user).toMatch(/Уровень сложности:\s*ЛЁГКИЙ/i);
    });

    it('difficulty=hard → сложный уровень', () => {
        const { user } = buildWorksheetPrompt({ topic: 'Дроби', difficulty: 'hard' });
        expect(user).toMatch(/Уровень сложности:\s*СЛОЖНЫЙ/i);
    });

    it('questionTypes=fill-blank → директива про заполнение пропусков', () => {
        const { user } = buildWorksheetPrompt({ topic: 'Дроби', questionTypes: 'fill-blank' });
        expect(user).toMatch(/fill-blank/i);
    });

    it('questionTypes=mixed → без жёсткой директивы формата', () => {
        const { user } = buildWorksheetPrompt({ topic: 'Дроби', questionTypes: 'mixed' });
        expect(user).not.toMatch(/Формат заданий/i);
    });

    it('extraNotes попадает в промпт', () => {
        const { user } = buildWorksheetPrompt({ topic: 'Дроби', extraNotes: 'в контексте футбола' });
        expect(user).toContain('в контексте футбола');
    });
});

describe('buildQuizPrompt', () => {
    it('difficulty=medium → средний уровень', () => {
        const { user } = buildQuizPrompt({ topic: 'Клетка', difficulty: 'medium' });
        expect(user).toMatch(/Уровень сложности:\s*СРЕДНИЙ/i);
    });

    it('без difficulty — нет строки', () => {
        const { user } = buildQuizPrompt({ topic: 'Клетка' });
        expect(user).not.toMatch(/Уровень сложности/i);
    });

    it('extraNotes попадает в промпт', () => {
        const { user } = buildQuizPrompt({ topic: 'Клетка', extraNotes: 'без картинок' });
        expect(user).toContain('без картинок');
    });
});
