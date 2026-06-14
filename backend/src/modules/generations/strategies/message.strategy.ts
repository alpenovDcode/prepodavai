import { Injectable } from '@nestjs/common';
import { GenerationStrategy, GenerationRequestParams } from '../interfaces/generation-strategy.interface';
import { DesignSystemConfig } from '../config/design-system.config';

const TEMPLATE_LABELS: Record<string, string> = {
  meeting: 'Приглашение на родительское собрание',
  progress: 'Отчёт об успеваемости ученика',
  behavior: 'Сообщение о поведении на уроке',
  praise: 'Похвала / благодарность',
  reminder: 'Напоминание о событии или сроке',
  'thank-you': 'Благодарность',
  free: 'Свободная форма (контекст в поле «Контекст»)',
};

const TONE_LABELS: Record<string, string> = {
  formal: 'Формальный — официальный, без эмодзи, обращение на «Вы»',
  friendly: 'Дружелюбный — лёгкий, естественный, на «Вы», уместны нейтральные эмодзи',
  warm: 'Тёплый — личный, эмпатичный, поддерживающий, на «Вы»',
  reserved: 'Сдержанный — нейтральный и тактичный, без эмоций и эмодзи, на «Вы»',
};

const CHANNEL_RULES: Record<string, string> = {
  messenger: 'Telegram / WhatsApp: короткое сообщение в 1–3 абзаца, до ~120 слов, без формального заголовка, разрешены 1–2 уместных эмодзи (если тон позволяет).',
  email: 'Email: полноценное письмо с темой (вынести в первый <p><strong>Тема: …</strong></p>), приветствием, основной частью и подписью от учителя, 150–250 слов.',
  diary: 'Электронный дневник: максимально короткая запись 1–2 предложения, сухой деловой стиль, без эмодзи, до ~40 слов.',
};

@Injectable()
export class MessageStrategy implements GenerationStrategy {
  supports(type: string): boolean {
    return type === 'message';
  }

  async generate(params: GenerationRequestParams): Promise<{ systemPrompt: string; userPrompt: string }> {
    const {
      formData,
      customPrompt,
      templateId,
      studentName,
      context,
      tone,
      channel,
      draftText,
    } = params as any;

    const isStructured = templateId || studentName || context || tone || channel;

    const templateLabel = templateId ? (TEMPLATE_LABELS[templateId] || templateId) : null;
    const toneLabel = tone ? (TONE_LABELS[tone] || tone) : null;
    const channelLabel = channel ? (CHANNEL_RULES[channel] || channel) : null;

    const systemPrompt = `
${DesignSystemConfig.PROMPT_MODULES.SYSTEM_INTRO}
Ты пишешь тактичные, выверенные сообщения родителям от лица школьного учителя.
Возвращаешь готовый HTML-документ.

ПРАВИЛА ТЕКСТА:
- Обращение всегда на «Вы», без панибратства.
- Не выдумывай факты, которых нет в контексте (даты, оценки, фамилии).
- Если данных мало — формулируй обобщённо, не придумывай конкретику.
- Никаких клише вроде «надеюсь, это письмо застанет вас в добром здравии».
- Подпись — «С уважением, классный руководитель» (без выдуманного ФИО).

${DesignSystemConfig.PROMPT_MODULES.MATHJAX_RULES}
${DesignSystemConfig.PROMPT_MODULES.INTERACTIVE_RULES}
${DesignSystemConfig.PROMPT_MODULES.CRITICAL_OUTPUT_RULES}
`;

    const structuredBlock = isStructured ? `
<message_brief>
Шаблон ситуации: ${templateLabel || '—'}
Ученик: ${studentName || '—'}
Контекст и детали: ${context || '—'}
Тон: ${toneLabel || 'Формальный'}
Канал доставки и правила длины:
${channelLabel || 'Telegram / WhatsApp: короткое сообщение в 1–3 абзаца, до ~120 слов.'}
${draftText ? `\nЧерновик учителя (оттолкнись от него, но улучши формулировки):\n${draftText}` : ''}
</message_brief>
` : '';

    const legacyBlock = !isStructured && formData ? `
<form_data>
${JSON.stringify(formData || {}, null, 2)}
</form_data>
` : '';

    const userPrompt = `# ТВОЯ ЗАДАЧА
Составь сообщение от учителя родителям по брифу ниже.
Отрази в тексте все указанные детали и строго соблюдай правила канала и тона.
${structuredBlock}${legacyBlock}
<html_skeleton>
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Сообщение родителям</title>
${DesignSystemConfig.STYLES}
${DesignSystemConfig.MATHJAX_SCRIPTS}
</head>
<body>
<div class="container">
  ${DesignSystemConfig.COMPONENTS.HEADER('Сообщение родителям')}

  <div class="message-content">
    <!-- Готовый текст сообщения здесь. Каждый абзац — отдельный <p>. -->
  </div>

  ${DesignSystemConfig.COMPONENTS.FOOTER}
</div>
</body>
</html>
</html_skeleton>

⚠️ ПРОВЕРЬ ПЕРЕД ВЫВОДОМ:
1. Имя ученика употреблено корректно (или сообщение универсально, если имени нет).
2. Длина и стиль соответствуют каналу.
3. Тон выдержан строго по требованию.
4. Нет выдуманных дат/оценок/имён, которых нет в брифе.

${customPrompt ? `ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (выполни обязательно): ${customPrompt}` : ''}

Начинай вывод сразу с <!DOCTYPE html>.`;

    return { systemPrompt, userPrompt };
  }
}
