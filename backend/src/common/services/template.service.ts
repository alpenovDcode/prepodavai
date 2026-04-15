import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private cache: Map<string, string> = new Map();

  /**
   * Считывает и кэширует шаблон
   * @param templateName Путь к шаблону, например: 'generations/quiz-template.html'
   */
  private getTemplateString(templateName: string): string {
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName)!;
    }

    const fullPath = path.join(process.cwd(), 'src', 'templates', templateName);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      this.cache.set(templateName, content);
      return content;
    } catch (error) {
      this.logger.error(`Error reading template: ${fullPath}`, error);
      throw new Error(`Template not found: ${templateName}`);
    }
  }

  /**
   * Рендерит шаблон, заменяя переменные вида {{key}} на значения
   * @param templateName Название файла (например 'generations/quiz-template.html')
   * @param variables Словарь переменных для подстановки
   */
  render(templateName: string, variables: Record<string, string>): string {
    let template = this.getTemplateString(templateName);

    for (const [key, value] of Object.entries(variables)) {
      // Заменяем все вхождения переменной
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      template = template.replace(regex, value || '');
    }

    return template;
  }
}
