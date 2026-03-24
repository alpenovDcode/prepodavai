import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as sanitizeHtml from 'sanitize-html';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = parseInt(this.configService.get<string>('SMTP_PORT', '465'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: host || 'smtp.yandex.ru',
        port: port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.warn(`SMTP credentials not provided. Email to ${to} not sent.`);
      return;
    }

    try {
      const from =
        this.configService.get<string>('SMTP_FROM') ||
        `"PrepodavAI" <${this.configService.get<string>('SMTP_USER')}>`;

      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Error sending email to ${to}:`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(username: string, apiKey: string, email: string) {
    const appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL', 'https://prepodavai.ru');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #2563eb;">Добро пожаловать в PrepodavAI!</h2>
        <p>Ваш аккаунт преподавателя успешно создан.</p>
        <p>Используйте следующие данные для входа на платформу:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Логин:</strong> ${sanitizeHtml(username)}</p>
          <p style="margin: 0;"><strong>API_KEY:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${sanitizeHtml(apiKey)}</code></p>
        </div>
        <p style="font-size: 14px; color: #6b7280;">Пожалуйста, сохраните ваш API_KEY в надежном месте. Он потребуется вам для входа в личный кабинет.</p>
        <p style="margin-top: 30px;">
          <a href="${appUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Войти на платформу
          </a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          Это автоматическое сообщение, на него не нужно отвечать.
        </p>
      </div>
    `;

    return this.sendEmail(email, 'Доступ к платформе PrepodavAI', html);
  }
}
