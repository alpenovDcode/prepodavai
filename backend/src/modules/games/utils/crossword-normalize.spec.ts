import { normalizeLetters } from './crossword-normalize';

/**
 * Правила сравнения букв в кроссворде — задокументированы тестами.
 * Функция должна быть одинаковой на backend (для тестов и валидации)
 * и в crossword.html inline-скрипте — при правках синхронизировать
 * обе копии.
 */

describe('normalizeLetters — латиница с диакритикой', () => {
    it('снимает острый акцент (испанский)', () => {
        expect(normalizeLetters('FÁCIL')).toBe('FACIL');
        expect(normalizeLetters('fácil')).toBe('FACIL');
    });

    it('снимает тильду с Ñ (испанский)', () => {
        expect(normalizeLetters('MAÑANA')).toBe('MANANA');
    });

    it('снимает circumflex (французский)', () => {
        expect(normalizeLetters('FÊTE')).toBe('FETE');
        expect(normalizeLetters('CÔTÉ')).toBe('COTE');
    });

    it('снимает седиль (французский)', () => {
        expect(normalizeLetters('GARÇON')).toBe('GARCON');
    });

    it('снимает тильду и cedilla (португальский)', () => {
        expect(normalizeLetters('COÇÃO')).toBe('COCAO');
    });

    it('снимает диакритику у полского (Ć, Ś, Ź, Ą, Ę, Ń, Ó)', () => {
        expect(normalizeLetters('DZIEŃ')).toBe('DZIEN');
        expect(normalizeLetters('JĘZYK')).toBe('JEZYK');
        expect(normalizeLetters('MÓJ')).toBe('MOJ');
    });

    it('снимает диакритику у чешского (Č, Š, Ř, Ž)', () => {
        expect(normalizeLetters('ČESKY')).toBe('CESKY');
        expect(normalizeLetters('ŘEŠENÍ')).toBe('RESENI');
    });

    it('снимает circumflex/tilde у вьетнамского', () => {
        expect(normalizeLetters('BÊ')).toBe('BE');
        expect(normalizeLetters('LÝ')).toBe('LY');
    });
});

describe('normalizeLetters — немецкий', () => {
    it('ß становится SS (одна буква разворачивается в две ячейки)', () => {
        expect(normalizeLetters('straße')).toBe('STRASSE');
        expect(normalizeLetters('STRAßE')).toBe('STRASSE');
    });

    it('снимает умлаут (Ä → A, Ö → O, Ü → U)', () => {
        expect(normalizeLetters('SCHÖNE')).toBe('SCHONE');
        expect(normalizeLetters('MÜLL')).toBe('MULL');
        expect(normalizeLetters('ÄPFEL')).toBe('APFEL');
    });
});

describe('normalizeLetters — русский', () => {
    it('НЕ смешивает Й и И (это разные буквы)', () => {
        expect(normalizeLetters('ЙОГУРТ')).toBe('ЙОГУРТ');
        expect(normalizeLetters('ЙОГУРТ')).not.toBe('ИОГУРТ');
    });

    it('приравнивает Ё к Е (взаимозаменяемо в кроссвордах)', () => {
        expect(normalizeLetters('ЁЛКА')).toBe('ЕЛКА');
        expect(normalizeLetters('ЁЖ')).toBe('ЕЖ');
        expect(normalizeLetters('её')).toBe('ЕЕ');
    });

    it('обычные русские слова остаются без изменений', () => {
        expect(normalizeLetters('дорога')).toBe('ДОРОГА');
        expect(normalizeLetters('МОЛОКО')).toBe('МОЛОКО');
    });

    it('строку с Й обрабатывает корректно (не decomposed)', () => {
        // регресс: без .normalize('NFC') в конце Й оставался decomposed
        // ('И' + U+0306), и .length становился 2 вместо 1
        expect(normalizeLetters('Й').length).toBe(1);
        expect(normalizeLetters('РАЙ').length).toBe(3);
    });
});

describe('normalizeLetters — английский и другие обычные случаи', () => {
    it('английские слова без изменений (кроме регистра)', () => {
        expect(normalizeLetters('hello')).toBe('HELLO');
        expect(normalizeLetters('world')).toBe('WORLD');
    });

    it('пустая строка и null безопасны', () => {
        expect(normalizeLetters('')).toBe('');
        expect(normalizeLetters(null as any)).toBe('');
        expect(normalizeLetters(undefined as any)).toBe('');
    });

    it('одиночная буква', () => {
        expect(normalizeLetters('a')).toBe('A');
        expect(normalizeLetters('Á')).toBe('A');
        expect(normalizeLetters('Ë')).toBe('E');
    });

    it('регистронезависимость', () => {
        expect(normalizeLetters('FáCiL')).toBe('FACIL');
    });
});

describe('normalizeLetters — идемпотентность', () => {
    it('повторное применение возвращает то же значение', () => {
        for (const s of ['FÁCIL', 'ЁЛКА', 'STRAßE', 'ЙОГУРТ', 'GARÇON']) {
            const once = normalizeLetters(s);
            const twice = normalizeLetters(once);
            expect(twice).toBe(once);
        }
    });
});
