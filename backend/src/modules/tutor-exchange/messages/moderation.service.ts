import { Injectable } from '@nestjs/common';

const PHONE_RE = /(?:\+7|\b8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b|\b\d{3}[\s\-]\d{3}[\s\-]\d{2}[\s\-]\d{2}\b/;
const USERNAME_RE = /(^|[^\w])@[A-Za-z0-9_]{4,}/;
const MESSENGER_RE = /(whats?app|вотс[аа]п|телеграм|telegram|t\.me\/|wa\.me\/|viber|вайбер|signal|skype|вконтакте|vk\.com|инстаграм|instagram|i?cloud\.com)/i;
const URL_RE = /https?:\/\/(?!zoom\.us|meet\.google\.com|teams\.microsoft\.com)[\w.-]+/i;

export type ContactHit = {
  phone: boolean;
  messenger: boolean;
  username: boolean;
  url: boolean;
};

@Injectable()
export class ModerationService {
  detectContacts(text: string): ContactHit | null {
    if (!text) return null;
    const phone = PHONE_RE.test(text);
    const messenger = MESSENGER_RE.test(text);
    const username = USERNAME_RE.test(text);
    const url = URL_RE.test(text);
    if (!phone && !messenger && !username && !url) return null;
    return { phone, messenger, username, url };
  }

  moderationWarningText(hit: ContactHit): string {
    const parts: string[] = [];
    if (hit.phone) parts.push('номер телефона');
    if (hit.username) parts.push('@username');
    if (hit.messenger) parts.push('внешний мессенджер');
    if (hit.url) parts.push('сторонняя ссылка');
    const what = parts.join(', ');
    return `⚠️ Кажется, в сообщении выше есть ${what}. Уход из платформы во внешний канал — частая схема обмана: на стороне не будет защиты сделки и возможности подать жалобу. Оставайтесь в чате платформы до завершения сделки.`;
  }
}
