import { detectForeignLanguage, subjectLanguageDirective } from './subject-language.util';

describe('subject-language.util', () => {
  describe('detectForeignLanguage', () => {
    it('распознаёт испанский по названию предмета', () => {
      expect(detectForeignLanguage('Испанский язык')?.prepositional).toBe('испанском');
    });

    it('распознаёт язык без слова «язык»', () => {
      expect(detectForeignLanguage('Английский')?.nominative).toBe('английский');
      expect(detectForeignLanguage('Deutsch')?.nominative).toBe('немецкий');
    });

    it('не считает языковыми обычные предметы', () => {
      expect(detectForeignLanguage('Математика')).toBeNull();
      expect(detectForeignLanguage('История')).toBeNull();
      expect(detectForeignLanguage('Физика')).toBeNull();
    });

    it('русский язык — родной, не требует спец-режима', () => {
      expect(detectForeignLanguage('Русский язык')).toBeNull();
    });

    it('пустой/undefined предмет → null', () => {
      expect(detectForeignLanguage(undefined)).toBeNull();
      expect(detectForeignLanguage('')).toBeNull();
    });
  });

  describe('subjectLanguageDirective', () => {
    it('для испанского требует писать материал на испанском и запрещает английский', () => {
      const d = subjectLanguageDirective('Испанский язык');
      expect(d).toContain('испанском');
      expect(d).toMatch(/запрещено.*английск/i);
    });

    it('для английского языка не выдаёт запрет на английский', () => {
      const d = subjectLanguageDirective('Английский язык');
      expect(d).toContain('английском');
      expect(d).not.toMatch(/запрещено.*английск/i);
    });

    it('для неязыкового предмета возвращает пустую строку', () => {
      expect(subjectLanguageDirective('Математика')).toBe('');
      expect(subjectLanguageDirective('Русский язык')).toBe('');
      expect(subjectLanguageDirective(undefined)).toBe('');
    });
  });
});
