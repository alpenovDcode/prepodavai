import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as sanitizeHtml from 'sanitize-html';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.yandex.ru';
    const port = parseInt(this.configService.get<string>('SMTP_PORT', '465'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port === 587,
        auth: { user, pass },
        connectionTimeout: 10000,
        socketTimeout: 15000,
      });

      // Verify connection on startup so misconfiguration shows up in logs immediately
      this.transporter.verify().then(() => {
        this.logger.log(`SMTP connection verified: ${host}:${port} (user: ${user})`);
      }).catch((err) => {
        this.logger.error(`SMTP connection failed on startup: ${host}:${port} — ${err?.message} (code: ${err?.code}, responseCode: ${err?.responseCode})`);
      });
    } else {
      this.logger.warn('SMTP_USER or SMTP_PASSWORD not set — email sending is disabled');
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.error(`SMTP credentials not configured. Cannot send email to ${to}.`);
      throw new Error('SMTP credentials not configured');
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
    } catch (error: any) {
      this.logger.error(
        `Error sending email to ${to}: ${error?.message} (code: ${error?.code}, responseCode: ${error?.responseCode}, command: ${error?.command})`,
      );
      throw error;
    }
  }

  async sendEmailVerificationCode(email: string, code: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #2563eb;">Подтверждение регистрации в PrepodavAI</h2>
        <p>Вы начали регистрацию на платформе. Введите код ниже для завершения.</p>
        <div style="background-color: #f3f4f6; padding: 30px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">Ваш код подтверждения:</p>
          <p style="margin: 0; font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #2563eb;">${sanitizeHtml(code)}</p>
        </div>
        <p style="font-size: 14px; color: #6b7280;">Код действителен в течение 10 минут. Никому не сообщайте его.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          Если вы не запрашивали регистрацию, просто проигнорируйте это письмо.
        </p>
      </div>
    `;
    return this.sendEmail(email, 'Код подтверждения PrepodavAI', html);
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
          <p style="margin: 0;"><strong>Пароль:</strong> <code style="background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${sanitizeHtml(apiKey)}</code></p>
        </div>
        <p style="font-size: 14px; color: #6b7280;">Пожалуйста, сохраните ваш пароль в надёжном месте. Он потребуется вам для входа в личный кабинет.</p>
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

  async sendHomeworkSubmittedEmail(
    email: string,
    params: { teacherName?: string | null; studentName: string; lessonTitle: string; assignmentId: string },
  ) {
    const appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL', 'https://prepodavai.ru');
    const link = `${appUrl}/dashboard/assignments/${encodeURIComponent(params.assignmentId)}`;
    const greeting = params.teacherName ? `Здравствуйте, ${sanitizeHtml(params.teacherName)}!` : 'Здравствуйте!';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #2563eb;">Новая работа на проверку</h2>
        <p>${greeting}</p>
        <p><strong>${sanitizeHtml(params.studentName)}</strong> сдал(а) работу по заданию <strong>«${sanitizeHtml(params.lessonTitle)}»</strong>.</p>
        <p style="margin-top: 24px;">
          <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Открыть работу
          </a>
        </p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">
          Вы получили это письмо, потому что в настройках включены email-уведомления о ДЗ.
        </p>
      </div>
    `;
    return this.sendEmail(email, `Новая работа на проверку: ${params.lessonTitle}`, html);
  }

  async sendHomeworkGradedEmail(
    email: string,
    params: { studentName: string; lessonTitle: string; grade: number; feedback?: string | null; assignmentId: string },
  ) {
    const appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL', 'https://prepodavai.ru');
    const link = `${appUrl}/student/assignments/${encodeURIComponent(params.assignmentId)}`;
    const feedbackBlock = params.feedback?.trim()
      ? `<div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #6b7280;">Комментарий учителя:</p>
          <p style="margin: 0; white-space: pre-wrap;">${sanitizeHtml(params.feedback)}</p>
        </div>`
      : '';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #2563eb;">Работа проверена!</h2>
        <p>Здравствуйте, ${sanitizeHtml(params.studentName)}!</p>
        <p>Учитель проверил вашу работу по заданию <strong>«${sanitizeHtml(params.lessonTitle)}»</strong>.</p>
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0 0 6px 0; font-size: 14px; color: #6b7280;">Ваша оценка</p>
          <p style="margin: 0; font-size: 40px; font-weight: bold; color: #2563eb;">${params.grade}</p>
        </div>
        ${feedbackBlock}
        <p style="margin-top: 24px;">
          <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Открыть задание
          </a>
        </p>
      </div>
    `;
    return this.sendEmail(email, `Работа проверена: ${params.lessonTitle}`, html);
  }

  async sendHomeworkDeadlineReminderEmail(
    email: string,
    params: { studentName: string; lessonTitle: string; dueDate: Date; assignmentId: string },
  ) {
    const appUrl = this.configService.get<string>('NEXT_PUBLIC_APP_URL', 'https://prepodavai.ru');
    const link = `${appUrl}/student/assignments/${encodeURIComponent(params.assignmentId)}`;
    const dueStr = params.dueDate.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const hoursLeft = Math.max(0, Math.round((params.dueDate.getTime() - Date.now()) / 3600000));

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="color: #d97706;">Напоминание: дедлайн скоро</h2>
        <p>Здравствуйте, ${sanitizeHtml(params.studentName)}!</p>
        <p>Срок сдачи задания <strong>«${sanitizeHtml(params.lessonTitle)}»</strong> истекает <strong>${dueStr}</strong> (через ~${hoursLeft} ч).</p>
        <p style="margin-top: 24px;">
          <a href="${link}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Перейти к заданию
          </a>
        </p>
      </div>
    `;
    return this.sendEmail(email, `Дедлайн скоро: ${params.lessonTitle}`, html);
  }
}
