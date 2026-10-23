import { WorksheetGenerationStrategy } from './worksheet.strategy';
import { QuizGenerationStrategy } from './quiz.strategy';
import { LessonPlanStrategy } from './lesson-plan.strategy';
import { buildWorksheetPrompt, buildQuizPrompt, buildLessonPlanPrompt } from '../v2/prompts';

/**
 * Регресс на баг: урок иностранного языка выдавал задания на английском.
 * Проверяем, что промпты во ВСЕХ путях генерации (стратегии + v2-билдеры)
 * получают явную директиву о языке для языковых предметов и не получают её
 * для обычных предметов.
 */
describe('языковая директива в промптах генерации', () => {
  const es = { subject: 'Испанский язык', topic: 'Expresiones idiomaticas', level: '8 класс' } as any;
  const math = { subject: 'Математика', topic: 'Дроби', level: '5 класс' } as any;

  it('worksheet-стратегия: для испанского — материал на испанском, английский запрещён', async () => {
    const { userPrompt } = await new WorksheetGenerationStrategy().generate(es);
    expect(userPrompt).toContain('испанском');
    expect(userPrompt).toMatch(/запрещено[\s\S]*английск/i);
  });

  it('worksheet-стратегия: для математики языковой директивы нет', async () => {
    const { userPrompt } = await new WorksheetGenerationStrategy().generate(math);
    expect(userPrompt).not.toContain('ЯЗЫК УЧЕБНОГО МАТЕРИАЛА');
  });

  it('quiz-стратегия: для испанского — материал на испанском', async () => {
    const { userPrompt } = await new QuizGenerationStrategy().generate(es);
    expect(userPrompt).toContain('испанском');
  });

  it('lesson-plan-стратегия: для испанского — материал на испанском', async () => {
    const { userPrompt } = await new LessonPlanStrategy().generate(es);
    expect(userPrompt).toContain('испанском');
  });

  it('v2-билдеры: worksheet/quiz/lesson-plan для испанского — материал на испанском', () => {
    expect(buildWorksheetPrompt(es).user).toContain('испанском');
    expect(buildQuizPrompt(es).user).toContain('испанском');
    expect(buildLessonPlanPrompt(es).user).toContain('испанском');
  });
});
