import { Injectable } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import { FieldConfig, ToolConfig, TOOL_CONFIGS } from './tool-configs';
import { GenerationSession } from './bot-session.service';

// Telegram callback_data ограничена 64 байтами.
// Формат: g:t:<toolKey> | g:v:<index> | g:skip | g:ok | g:no
// Максимальная длина toolKey = 15 → "g:t:exam-variant" = 16 байт — OK.

@Injectable()
export class BotWizardService {
  // ── Клавиатуры ──────────────────────────────────────────────────────────────

  buildToolSelectionKeyboard(): InlineKeyboard {
    const kb = new InlineKeyboard();
    TOOL_CONFIGS.forEach((tool, i) => {
      if (i > 0 && i % 2 === 0) kb.row();
      kb.text(`${tool.emoji} ${tool.label}`, `g:t:${tool.key}`);
    });
    return kb;
  }

  buildFieldKeyboard(field: FieldConfig, session: GenerationSession): InlineKeyboard | null {
    // Файловое поле — только кнопка отмены, ждём сообщение с файлом
    if (field.type === 'file') {
      return new InlineKeyboard().text('❌ Отмена', 'g:no');
    }

    const options = this.resolveOptions(field, session.params);

    if (!options) {
      // Текстовое поле — кнопки не нужны, только кнопка «Пропустить»
      if (!field.required && field.skipLabel) {
        return new InlineKeyboard().text(`⏭️ ${field.skipLabel}`, 'g:skip');
      }
      return null;
    }

    // Select-поле: показываем варианты кнопками
    const kb = new InlineKeyboard();
    const cols = options.length <= 3 ? options.length : 2;
    options.forEach((opt, i) => {
      if (i > 0 && i % cols === 0) kb.row();
      // Индекс опции кодируем в callback_data — безопасно, нет произвольного ввода
      kb.text(opt.label, `g:v:${i}`);
    });

    if (!field.required && field.skipLabel) {
      kb.row().text(`⏭️ ${field.skipLabel}`, 'g:skip');
    }

    return kb;
  }

  buildConfirmKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text('✅ Генерировать', 'g:ok')
      .text('❌ Отмена', 'g:no');
  }

  // ── Сообщения ────────────────────────────────────────────────────────────────

  buildConfirmMessage(tool: ToolConfig, params: Record<string, string>): string {
    const lines: string[] = [`*${tool.emoji} ${tool.label}* — подтверждение\n`];
    for (const field of tool.fields) {
      const val = params[field.key];
      if (val !== undefined && val !== '') {
        lines.push(`• ${val}`);
      }
    }
    lines.push(`\n💳 Стоимость: *${tool.creditCost} токена*`);
    lines.push(`⏱ Примерное время: *${tool.estimatedTime}*`);
    lines.push('\nГенерировать?');
    return lines.join('\n');
  }

  // ── Валидация ────────────────────────────────────────────────────────────────

  /**
   * Возвращает строку ошибки или null если всё ОК.
   */
  validateText(raw: string, field: FieldConfig): string | null {
    const value = raw.trim();
    if (field.required && !value) {
      return '❌ Это поле обязательно. Пожалуйста, введите текст.';
    }
    if (value.length > field.maxLength) {
      return `❌ Слишком длинный текст. Максимум — ${field.maxLength} символов.`;
    }
    return null;
  }

  /**
   * Удаляет управляющие символы и обрезает пробелы.
   * Предотвращает попытки инъекций через специальные байты.
   */
  sanitize(raw: string): string {
    // Убираем всё кроме печатаемых символов + \n \t
    return raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  }

  /**
   * Возвращает value выбранной опции по её индексу.
   * null — если индекс вне допустимого диапазона (защита от подделки callback_data).
   */
  resolveOptionByIndex(
    field: FieldConfig,
    index: number,
    params: Record<string, string>,
  ): string | null {
    const options = this.resolveOptions(field, params);
    if (!options || index < 0 || index >= options.length) return null;
    return options[index].value;
  }

  // ── Вспомогательные ──────────────────────────────────────────────────────────

  private resolveOptions(field: FieldConfig, params: Record<string, string>) {
    if (field.conditionalOptions) return field.conditionalOptions(params);
    return field.options ?? null;
  }
}
