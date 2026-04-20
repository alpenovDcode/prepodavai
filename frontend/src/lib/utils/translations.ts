export const generationTypeLabels: Record<string, string> = {
  'plan': '📋 План урока',
  'lesson-plan': '📋 План урока',
  'lesson_plan': '📋 План урока',
  'lessonPlan': '📋 План урока',
  'presentation': '📊 Презентация',
  'quiz': '❓ Тест/Викторина',
  'unpacking': '📦 Распаковка',
  'video-analysis': '🎬 Анализ видео',
  'video_analysis': '🎬 Анализ видео',
  'videoAnalysis': '🎬 Анализ видео',
  'photosession': '📸 ИИ Фотосессия',
  'exam-variant': '📝 Вариант ОГЭ/ЕГЭ',
  'exam_variant': '📝 Вариант ОГЭ/ЕГЭ',
  'worksheet': '📄 Рабочий лист',
  'lesson-preparation': '🎓 Вау-урок',
  'lesson_preparation': '🎓 Вау-урок',
  'lessonPreparation': '🎓 Вау-урок',
  'content-adaptation': '🔄 Адаптация контента',
  'content_adaptation': '🔄 Адаптация контента',
  'content': '🔄 Адаптация контента',
  'feedback': '💬 Обратная связь',
  'message': '✉️ Сообщение',
  'vocabulary': '📚 Словарь',
  'transcription': '🎬 Транскрипция видео',
  'salesAdvisor': '💼 ИИ Продажник',
  'sales_advisor': '💼 ИИ Продажник',
  'sales-advisor': '💼 ИИ Продажник',
  'game': '🎮 Мини-игра',
  'game_generation': '🎮 Мини-игра',
  'image': '🎨 Изображение',
  'image_generation': '🎨 Изображение',
  'assistant': '🤖 ИИ-ассистент',
};

export const getGenerationTypeLabel = (type: string | undefined | null): string => {
  if (!type) return 'Материал';
  const normalized = type.trim();
  return generationTypeLabels[normalized] || type;
};

export const getGenerationTypeIcon = (type: string | undefined | null): string => {
  if (!type) return 'fa-file-alt';
  const normalized = type.trim();
  
  if (normalized === 'plan' || normalized === 'lesson-plan' || normalized === 'lesson_plan' || normalized === 'lessonPlan') return 'fa-list-ol';
  if (normalized === 'presentation') return 'fa-file-powerpoint';
  if (normalized === 'quiz') return 'fa-question-circle';
  if (normalized === 'unpacking') return 'fa-box';
  if (normalized.includes('video')) return 'fa-video';
  if (normalized === 'photosession' || normalized.includes('image')) return 'fa-camera';
  if (normalized.includes('exam')) return 'fa-graduation-cap';
  if (normalized === 'worksheet') return 'fa-file-pdf';
  
  if (normalized === 'assistant') return 'fa-robot';
  
  return 'fa-file-alt';
};
