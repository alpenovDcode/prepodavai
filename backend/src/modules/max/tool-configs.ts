export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'file' | 'multiselect';
  skipToEnd?: boolean; // when skip is pressed, jump to confirmation instead of next field
  required: boolean;
  default?: string;
  options?: FieldOption[];
  conditionalOptions?: (params: Record<string, string>) => FieldOption[];
  maxLength: number;
  skipLabel?: string;
  accept?: 'photo' | 'document';
  maxSizeMb?: number;
  storeAs?: 'hash' | 'url';
}

export interface ToolConfig {
  key: string;
  generationType: string;
  serviceType: 'generations' | 'games';
  label: string;
  emoji: string;
  creditCost: number;
  estimatedTime: string;
  fields: FieldConfig[];
}

const SCHOOL_LEVELS: FieldOption[] = [
  { value: 'Младшие классы', label: 'Младшие классы (1–4)' },
  { value: 'Средняя школа', label: 'Средняя школа (5–8)' },
  { value: 'Старшие классы', label: 'Старшие классы (9–11)' },
  { value: 'Взрослые', label: 'Взрослые' },
  { value: 'Подготовка к ОГЭ', label: 'Подготовка к ОГЭ' },
  { value: 'Подготовка к ЕГЭ', label: 'Подготовка к ЕГЭ' },
  { value: 'Студенты вузов', label: 'Студенты вузов' },
];

const CLASS_GRADES: FieldOption[] = Array.from({ length: 11 }, (_, i) => ({
  value: `${i + 1} Класс`,
  label: `${i + 1} класс`,
}));


export const TOOL_CONFIGS: ToolConfig[] = [
  {
    key: 'worksheet',
    generationType: 'worksheet',
    serviceType: 'generations',
    label: 'Рабочий лист',
    emoji: '📄',
    creditCost: 3,
    estimatedTime: '~30 сек',
    fields: [
      { key: 'subject', label: '📚 Предмет (необязательно)\n\nНапример: Математика, История, Биология', type: 'text', required: false, maxLength: 100, skipLabel: 'Пропустить' },
      { key: 'topic', label: '✏️ Тема урока\n\nНапример: Квадратные уравнения, Первая мировая война', type: 'text', required: true, maxLength: 200 },
      { key: 'level', label: '🎓 Уровень учеников', type: 'select', required: true, default: 'Средняя школа', options: SCHOOL_LEVELS, maxLength: 50 },
      { key: 'questionsCount', label: '🔢 Количество заданий', type: 'select', required: true, default: '10', options: [{ value: '5', label: '5 заданий' }, { value: '10', label: '10 заданий' }, { value: '15', label: '15 заданий' }, { value: '20', label: '20 заданий' }], maxLength: 3 },
    ],
  },
  {
    key: 'quiz',
    generationType: 'quiz',
    serviceType: 'generations',
    label: 'Генератор тестов',
    emoji: '📝',
    creditCost: 2,
    estimatedTime: '~30 сек',
    fields: [
      { key: 'subject', label: '📚 Предмет (необязательно)\n\nНапример: Биология, Физика', type: 'text', required: false, maxLength: 100, skipLabel: 'Пропустить' },
      { key: 'topic', label: '✏️ Тема теста\n\nНапример: Клетка и её строение', type: 'text', required: true, maxLength: 200 },
      { key: 'level', label: '🎓 Класс', type: 'select', required: true, default: '8 Класс', options: CLASS_GRADES, maxLength: 10 },
      { key: 'questionsCount', label: '🔢 Количество вопросов', type: 'select', required: true, default: '10', options: [{ value: '5', label: '5 вопросов' }, { value: '10', label: '10 вопросов' }, { value: '15', label: '15 вопросов' }, { value: '20', label: '20 вопросов' }, { value: '25', label: '25 вопросов' }], maxLength: 3 },
      { key: 'answersCount', label: '✅ Вариантов ответа на каждый вопрос', type: 'select', required: true, default: '4', options: [{ value: '2', label: '2 варианта' }, { value: '3', label: '3 варианта' }, { value: '4', label: '4 варианта' }], maxLength: 2 },
    ],
  },
  {
    key: 'vocabulary',
    generationType: 'vocabulary',
    serviceType: 'generations',
    label: 'Словарь',
    emoji: '📖',
    creditCost: 2,
    estimatedTime: '~20 сек',
    fields: [
      { key: 'topic', label: '✏️ Тема словаря\n\nНапример: Путешествия, Еда, Математические термины', type: 'text', required: true, maxLength: 200 },
      { key: 'language', label: '🌍 Язык', type: 'select', required: true, default: 'en', options: [{ value: 'ru', label: '🇷🇺 Русский' }, { value: 'en', label: '🇬🇧 Английский' }, { value: 'de', label: '🇩🇪 Немецкий' }, { value: 'fr', label: '🇫🇷 Французский' }, { value: 'es', label: '🇪🇸 Испанский' }, { value: 'it', label: '🇮🇹 Итальянский' }, { value: 'zh', label: '🇨🇳 Китайский' }, { value: 'ko', label: '🇰🇷 Корейский' }, { value: 'ja', label: '🇯🇵 Японский' }, { value: 'ar', label: '🇸🇦 Арабский' }], maxLength: 5 },
      { key: 'wordsCount', label: '🔢 Количество слов', type: 'select', required: true, default: '10', options: [{ value: '5', label: '5 слов' }, { value: '10', label: '10 слов' }, { value: '15', label: '15 слов' }, { value: '20', label: '20 слов' }, { value: '25', label: '25 слов' }, { value: '30', label: '30 слов' }], maxLength: 3 },
    ],
  },
  {
    key: 'lesson-plan',
    generationType: 'lesson-plan',
    serviceType: 'generations',
    label: 'Конструктор уроков',
    emoji: '📋',
    creditCost: 3,
    estimatedTime: '~40 сек',
    fields: [
      { key: 'subject', label: '📚 Предмет (необязательно)', type: 'text', required: false, maxLength: 100, skipLabel: 'Пропустить' },
      { key: 'topic', label: '✏️ Тема урока\n\nНапример: Теорема Пифагора, Фотосинтез', type: 'text', required: true, maxLength: 200 },
      { key: 'level', label: '🎓 Класс', type: 'select', required: true, default: '7 Класс', options: [{ value: '5 Класс', label: '5 класс' }, { value: '6 Класс', label: '6 класс' }, { value: '7 Класс', label: '7 класс' }, { value: '8 Класс', label: '8 класс' }, { value: 'Старшая Школа', label: '9–11 класс' }], maxLength: 20 },
      { key: 'duration', label: '⏱️ Длительность урока', type: 'select', required: true, default: '45', options: [{ value: '30', label: '30 минут' }, { value: '45', label: '45 минут' }, { value: '90', label: '90 минут' }], maxLength: 3 },
      { key: 'style', label: '🎯 Стиль урока', type: 'select', required: true, default: 'Интерактивный', options: [{ value: 'Интерактивный', label: '🎮 Интерактивный' }, { value: 'Лекция', label: '📖 Лекция' }], maxLength: 20 },
    ],
  },
  {
    key: 'lesson-preparation',
    generationType: 'lesson-preparation',
    serviceType: 'generations',
    label: 'Вау-урок',
    emoji: '✨',
    creditCost: 5,
    estimatedTime: '~60 сек',
    fields: [
      { key: 'subject', label: '📚 Предмет (необязательно)\n\nНапример: Математика, Биология', type: 'text', required: false, maxLength: 100, skipLabel: 'Пропустить' },
      { key: 'topic', label: '✏️ Тема урока\n\nНапример: Дроби, Фотосинтез, Первая мировая война', type: 'text', required: true, maxLength: 200 },
      { key: 'level', label: '🎓 Класс', type: 'select', required: true, default: '5', options: Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} класс` })), maxLength: 3 },
      { key: 'interests', label: '🎮 Интересы ученика (необязательно)\n\nНапример: Minecraft, футбол, аниме', type: 'text', required: false, maxLength: 200, skipLabel: 'Пропустить' },
      { key: 'generationTypes', label: '📋 Что сгенерировать?\n\nВыберите один или несколько разделов и нажмите *Готово*:', type: 'multiselect', required: true, options: [
        { value: 'lesson-plan', label: 'План урока' },
        { value: 'worksheet', label: 'Рабочий лист' },
        { value: 'content-adaptation', label: 'Учебный материал' },
        { value: 'quiz', label: 'Тест' },
      ], maxLength: 100 },
      { key: 'depth', label: '📊 Глубина материала', type: 'select', required: true, default: 'standard', options: [{ value: 'short', label: '⚡ Краткий' }, { value: 'standard', label: '⚖️ Стандартный' }, { value: 'deep', label: '🔬 Развёрнутый' }], maxLength: 10 },
    ],
  },
  {
    key: 'image',
    generationType: 'image',
    serviceType: 'generations',
    label: 'Генератор изображений',
    emoji: '🖼️',
    creditCost: 5,
    estimatedTime: '~25 сек',
    fields: [
      { key: 'prompt', label: '🖼️ Опишите изображение\n\nНапример: Строение клетки с подписями на русском, Карта Древнего Рима', type: 'text', required: true, maxLength: 500 },
      { key: 'style', label: '🎨 Стиль', type: 'select', required: true, default: 'realistic', options: [{ value: 'realistic', label: '📸 Реалистичный' }, { value: 'cartoon', label: '🎨 Мультяшный' }, { value: 'sketch', label: '✏️ Эскиз' }, { value: 'illustration', label: '🖌️ Иллюстрация' }, { value: '3d-model', label: '🗿 3D модель' }, { value: 'anime', label: '⛩️ Аниме' }], maxLength: 20 },
    ],
  },
  {
    key: 'game',
    generationType: 'game_generation',
    serviceType: 'games',
    label: 'Обучающая игра',
    emoji: '🎮',
    creditCost: 15,
    estimatedTime: '~25 сек',
    fields: [
      { key: 'type', label: '🎮 Тип игры', type: 'select', required: true, default: 'flashcards', options: [{ value: 'millionaire', label: '💰 Кто хочет стать миллионером' }, { value: 'flashcards', label: '📇 Флеш-карточки' }, { value: 'crossword', label: '🧩 Кроссворд' }, { value: 'memory', label: '🔍 Найди пару' }, { value: 'truefalse', label: '✅ Правда или Ложь' }], maxLength: 20 },
      { key: 'topic', label: '✏️ Тема игры\n\nНапример: История Древнего Рима, Таблица умножения', type: 'text', required: true, maxLength: 200 },
    ],
  },
  {
    key: 'presentation',
    generationType: 'presentation',
    serviceType: 'generations',
    label: 'Презентация',
    emoji: '📊',
    creditCost: 8,
    estimatedTime: '~2 мин',
    fields: [
      { key: 'topic', label: '✏️ Тема презентации\n\nНапример: Фотосинтез, Первая мировая война, Python для начинающих', type: 'text', required: true, maxLength: 300 },
      { key: 'duration', label: '⏱️ Длительность выступления', type: 'select', required: true, default: '15', options: [{ value: '5', label: '5 минут (~5 слайдов)' }, { value: '15', label: '15 минут (~10 слайдов)' }, { value: '30', label: '30 минут (~20 слайдов)' }, { value: '45', label: '45 минут (~30 слайдов)' }], maxLength: 3 },
      { key: 'style', label: '🎨 Стиль оформления', type: 'select', required: true, default: 'modern', options: [{ value: 'modern', label: '✨ Минимализм' }, { value: 'academic', label: '📚 Строгий (академический)' }, { value: 'creative', label: '🌈 Яркий (творческий)' }, { value: 'corporate', label: '💼 Деловой (корпоративный)' }], maxLength: 20 },
      { key: 'targetAudience', label: '👥 Аудитория', type: 'select', required: true, default: 'students', options: [{ value: 'students', label: '🎒 Ученики / Студенты' }, { value: 'colleagues', label: '👔 Коллеги' }, { value: 'parents', label: '👨‍👩‍👧 Родители' }, { value: 'general', label: '👥 Широкая аудитория' }], maxLength: 20 },
    ],
  },
];

export function getToolConfig(key: string): ToolConfig | undefined {
  return TOOL_CONFIGS.find((t) => t.key === key);
}
