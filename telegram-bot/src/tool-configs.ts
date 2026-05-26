export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'select' | 'file';
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

const OGE_SUBJECTS = [
  'Русский язык', 'Математика', 'Физика', 'Химия', 'Биология',
  'История', 'Обществознание', 'Литература', 'Информатика',
  'Английский язык', 'Немецкий язык', 'Французский язык', 'Испанский язык', 'География',
];
const EGE_SUBJECTS = [
  ...OGE_SUBJECTS, 'Математика (профильная)', 'Математика (базовая)',
];
const VPR_SUBJECTS = [
  'Русский язык', 'Математика', 'Окружающий мир', 'Физика', 'Химия', 'Биология',
  'История', 'Обществознание', 'Литература', 'Английский язык',
  'Немецкий язык', 'Французский язык', 'География',
];

function toOptions(arr: string[]): FieldOption[] {
  return arr.map((s) => ({ value: s, label: s }));
}

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
    key: 'exam-variant',
    generationType: 'exam-variant',
    serviceType: 'generations',
    label: 'Вариант ОГЭ/ЕГЭ',
    emoji: '🎓',
    creditCost: 20,
    estimatedTime: '~60 сек',
    fields: [
      { key: 'level', label: '📋 Тип экзамена', type: 'select', required: true, default: 'ОГЭ (9 класс)', options: [{ value: 'ОГЭ (9 класс)', label: 'ОГЭ (9 класс)' }, { value: 'ЕГЭ (11 класс)', label: 'ЕГЭ (11 класс)' }, { value: 'ВПР', label: 'ВПР' }], maxLength: 20 },
      {
        key: 'subject', label: '📚 Предмет', type: 'select', required: true, maxLength: 50,
        conditionalOptions: (params) => {
          const level = params.level ?? 'ОГЭ (9 класс)';
          if (level.startsWith('ЕГЭ')) return toOptions(EGE_SUBJECTS);
          if (level === 'ВПР') return toOptions(VPR_SUBJECTS);
          return toOptions(OGE_SUBJECTS);
        },
      },
      { key: 'questionsCount', label: '🔢 Количество заданий', type: 'select', required: true, default: '20', options: [{ value: '5', label: '5 заданий' }, { value: '10', label: '10 заданий' }, { value: '15', label: '15 заданий' }, { value: '20', label: '20 заданий' }, { value: '30', label: '30 заданий' }], maxLength: 3 },
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
  {
    key: 'video-analysis',
    generationType: 'video-analysis',
    serviceType: 'generations',
    label: 'Анализ видео',
    emoji: '🎬',
    creditCost: 15,
    estimatedTime: '~2-5 мин',
    fields: [
      { key: 'fileUrl', label: '🔗 Ссылка на видео в Яндекс.Диске\n\nОткройте доступ по ссылке и вставьте её сюда.\nПример: https://disk.yandex.ru/i/...', type: 'text', required: true, maxLength: 500 },
      { key: 'analysisType', label: '🔍 Тип анализа', type: 'select', required: true, default: 'methodological', options: [{ value: 'methodological', label: '📋 Методический анализ урока' }, { value: 'sales', label: '💰 Анализ пробного урока (продажи)' }], maxLength: 20 },
    ],
  },
  {
    key: 'photosession',
    generationType: 'photosession',
    serviceType: 'generations',
    label: 'AI Фотосессия',
    emoji: '📸',
    creditCost: 10,
    estimatedTime: '~50 сек',
    fields: [
      { key: 'photoHash', label: '📸 Отправьте вашу фотографию\n\nЛучше всего работает чёткое фото лица.\nМаксимальный размер — 20 МБ.', type: 'file', required: true, accept: 'photo', maxSizeMb: 20, storeAs: 'hash', maxLength: 64 },
      { key: 'style', label: '🎨 Стиль', type: 'select', required: true, default: 'realistic', options: [{ value: 'realistic', label: '📸 Реалистичный' }, { value: 'artistic', label: '🎨 Художественный' }, { value: 'professional', label: '💼 Профессиональный' }, { value: 'creative', label: '✨ Творческий' }], maxLength: 20 },
      { key: 'size', label: '📐 Размер изображения', type: 'select', required: true, default: '1024x1024', options: [{ value: '1024x1024', label: '⬛ Квадрат (1:1)' }, { value: '1024x1792', label: '📱 Вертикаль (9:16)' }, { value: '1792x1024', label: '🖥️ Горизонталь (16:9)' }], maxLength: 20 },
      { key: 'prompt', label: '🌟 Сценарий фотосессии', type: 'select', required: true, default: 'Деловой портрет', options: [{ value: 'Летний портрет', label: '☀️ Летний портрет' }, { value: 'Деловой портрет', label: '💼 Деловой портрет' }, { value: 'Семейная фотосессия', label: '👨‍👩‍👧 Семейная' }, { value: 'Портрет в студии', label: '🎬 Студийный портрет' }, { value: 'Романтическая фотосессия', label: '💕 Романтическая' }, { value: 'Спортивная фотосессия', label: '🏃 Спортивная' }, { value: 'Детская фотосессия', label: '🧸 Детская' }, { value: 'Выпускная фотосессия', label: '🎓 Выпускная' }, { value: 'Портрет в городе', label: '🏙️ Городской портрет' }, { value: 'На пляже', label: '🏖️ На пляже' }, { value: 'В библиотеке', label: '📚 В библиотеке' }, { value: 'Свадебная фотосессия', label: '💍 Свадебная' }], maxLength: 50 },
    ],
  },
  {
    key: 'transcription',
    generationType: 'transcription',
    serviceType: 'generations',
    label: 'Транскрибация',
    emoji: '🎙️',
    creditCost: 15,
    estimatedTime: '~3-10 мин',
    fields: [
      { key: 'fileUrl', label: '🎙️ Отправьте аудио или видео файл\n\nПоддерживается: MP3, WAV, OGG, M4A, MP4, MOV\nМаксимальный размер — 20 МБ.', type: 'file', required: true, accept: 'document', maxSizeMb: 20, storeAs: 'url', maxLength: 500 },
      { key: 'language', label: '🌍 Язык записи', type: 'select', required: true, default: 'ru', options: [{ value: 'ru', label: '🇷🇺 Русский' }, { value: 'en', label: '🇬🇧 Английский' }, { value: 'auto', label: '🔍 Определить автоматически' }], maxLength: 5 },
    ],
  },
];

export function getToolConfig(key: string): ToolConfig | undefined {
  return TOOL_CONFIGS.find((t) => t.key === key);
}
