import { ModerationService } from './moderation.service';

describe('ModerationService', () => {
  const s = new ModerationService();

  describe('detectContacts', () => {
    it('returns null for empty text', () => {
      expect(s.detectContacts('')).toBeNull();
    });

    it('returns null for benign message', () => {
      expect(s.detectContacts('Пришлю задание завтра к 18:00')).toBeNull();
    });

    it('detects Russian phone with +7', () => {
      const hit = s.detectContacts('Мой номер +7 999 111-22-33');
      expect(hit).not.toBeNull();
      expect(hit!.phone).toBe(true);
    });

    it('detects Russian phone with 8', () => {
      const hit = s.detectContacts('Позвони 8-999-111-22-33');
      expect(hit!.phone).toBe(true);
    });

    it('detects @username', () => {
      const hit = s.detectContacts('пишите @durov');
      expect(hit!.username).toBe(true);
    });

    it('ignores emails ("@" not a username)', () => {
      // email содержит @ но с точкой в домене — user@... не 4+ подряд буквенно-цифровое, регексп требует чистый @slug на границе слова
      const hit = s.detectContacts('mail: user.name');
      expect(hit).toBeNull();
    });

    it('detects messenger name', () => {
      expect(s.detectContacts('напиши в whatsapp')!.messenger).toBe(true);
      expect(s.detectContacts('пиши в телеграм')!.messenger).toBe(true);
      expect(s.detectContacts('t.me/xxx')!.messenger).toBe(true);
    });

    it('detects external url but not zoom/meet/teams', () => {
      expect(s.detectContacts('https://example.com')!.url).toBe(true);
      expect(s.detectContacts('https://zoom.us/j/123')).toBeNull();
      expect(s.detectContacts('https://meet.google.com/abc')).toBeNull();
    });
  });

  describe('moderationWarningText', () => {
    it('lists phone', () => {
      expect(
        s.moderationWarningText({ phone: true, messenger: false, username: false, url: false }),
      ).toContain('номер телефона');
    });

    it('lists multiple parts', () => {
      const t = s.moderationWarningText({ phone: true, messenger: true, username: false, url: false });
      expect(t).toContain('номер телефона');
      expect(t).toContain('внешний мессенджер');
    });
  });
});
