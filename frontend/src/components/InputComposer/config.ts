/**
 * Конфигурация для InputComposer
 * Определяет шаблоны и поля для каждого типа генерации
 */

export interface FieldOption {
  value: string
  label: string
}

// Готовые промпты для фотосессии
export const photosessionPrompts: FieldOption[] = [
  {
    label: 'Летний портрет в саду',
    value: 'Летний портрет в саду, яркие цвета, теплое освещение, естественные позы, профессиональная фотография'
  },
  {
    label: 'Деловой портрет в офисе',
    value: 'Деловой портрет в современном офисе, профессиональная одежда, естественное освещение, уверенная поза, качественная фотография'
  },
  {
    label: 'Семейная фотосессия на природе',
    value: 'Семейная фотосессия на природе, теплая атмосфера, естественные эмоции, красивое окружение, профессиональная съемка'
  },
  {
    label: 'Портрет в студии',
    value: 'Студийный портрет, профессиональное освещение, нейтральный фон, выразительный взгляд, высокое качество'
  },
  {
    label: 'Романтическая фотосессия на закате',
    value: 'Романтическая фотосессия на закате, мягкое золотистое освещение, красивые пейзажи, естественные позы, атмосферная съемка'
  },
  {
    label: 'Спортивная фотосессия',
    value: 'Спортивная фотосессия, динамичные позы, яркое освещение, спортивная одежда, энергичная атмосфера, профессиональная съемка'
  },
  {
    label: 'Детская фотосессия в парке',
    value: 'Детская фотосессия в парке, веселая атмосфера, естественные эмоции, яркие цвета, игривые позы, качественная фотография'
  },
  {
    label: 'Выпускная фотосессия',
    value: 'Выпускная фотосессия, элегантная одежда, красивое окружение, торжественная атмосфера, профессиональная съемка, высокое качество'
  },
  {
    label: 'Портрет в городской среде',
    value: 'Портрет в городской среде, современная архитектура, естественное освещение, стильная одежда, динамичная композиция'
  },
  {
    label: 'Фотосессия на пляже',
    value: 'Фотосессия на пляже, морской пейзаж, естественное освещение, расслабленная атмосфера, красивые позы, профессиональная съемка'
  },
  {
    label: 'Портрет в библиотеке',
    value: 'Портрет в библиотеке, интеллектуальная атмосфера, мягкое освещение, книги на фоне, задумчивая поза, качественная фотография'
  },
  {
    label: 'Свадебная фотосессия',
    value: 'Свадебная фотосессия, элегантные наряды, красивое окружение, романтическая атмосфера, нежные позы, профессиональная съемка'
  }
]

export interface Field {
  key: string
  label: string
  type: 'text' | 'select' | 'number' | 'textarea' | 'file'
  placeholder?: string
  options?: FieldOption[]
  min?: number
  max?: number
  rows?: number
  accept?: string
  step?: number
  helperText?: string
  showWhen?: {
    field: string
    equals?: string | number
    in?: Array<string | number>
  }
}

export interface Segment {
  type: 'text' | 'field'
  value?: string
  key?: string
  label?: string
  placeholder?: string
}

export interface FunctionTemplate {
  segments: Segment[]
  fields: Field[]
}

export const functions = [
  { id: 'worksheet', title: 'Рабочий лист', icon: 'fas fa-file-alt' },
  { id: 'quiz', title: 'Тест', icon: 'fas fa-question-circle' },
  { id: 'vocabulary', title: 'Словарь', icon: 'fas fa-book' },
  { id: 'lessonPlan', title: 'План урока', icon: 'fas fa-chalkboard-teacher' },
  { id: 'content', title: 'Адаптация', icon: 'fas fa-exchange-alt' },
  { id: 'feedback', title: 'Фидбек', icon: 'fas fa-comments' },
  { id: 'presentation', title: 'Презентация', icon: 'fas fa-slideshare' },
  { id: 'image', title: 'Изображение', icon: 'fas fa-image' },
  { id: 'photosession', title: 'Фотосессия', icon: 'fas fa-camera' },
  { id: 'transcription', title: 'Транскрибация', icon: 'fas fa-file-audio' },
  { id: 'message', title: 'Сообщение', icon: 'fas fa-envelope' },
  { id: 'gigachat', title: 'GigaChat', icon: 'fas fa-brain' }
]

export const templates: Record<string, FunctionTemplate> = {
  worksheet: {
    segments: [
      { type: 'text', value: 'Я хочу сделать задания по предмету ' },
      { type: 'field', key: 'subject', label: 'Предмет', placeholder: 'Предмет' },
      { type: 'text', value: ' для ' },
      { type: 'field', key: 'level', label: 'Класс', placeholder: '1–11' },
      { type: 'text', value: ' класса по теме ' },
      { type: 'field', key: 'topic', label: 'Тема', placeholder: 'Тема' },
      { type: 'text', value: '. ' },
      { type: 'text', value: 'Учитывай мои пожелания: ' },
      { type: 'field', key: 'preferences', label: 'Пожелания', placeholder: 'формат, сложность' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'subject', label: 'Предмет', type: 'text', placeholder: 'Математика' },
      { key: 'topic', label: 'Тема', type: 'text', placeholder: 'Деление дробей' },
      {
        key: 'level',
        label: 'Класс',
        type: 'select',
        options: Array.from({ length: 11 }, (_, i) => ({
          value: String(i + 1),
          label: `${i + 1} класс`
        }))
      },
      { key: 'questionsCount', label: 'Количество заданий', type: 'number', min: 1, max: 20 },
      { key: 'preferences', label: 'Пожелания', type: 'text', placeholder: 'формат, сложность' }
    ]
  },
  quiz: {
    segments: [
      { type: 'text', value: 'Мне нужен тест по предмету ' },
      { type: 'field', key: 'subject', label: 'Предмет', placeholder: 'Предмет' },
      { type: 'text', value: ' для ' },
      { type: 'field', key: 'level', label: 'Класс', placeholder: '1–11' },
      { type: 'text', value: ' класса. Тема: ' },
      { type: 'field', key: 'topic', label: 'Тема', placeholder: 'Тема' },
      { type: 'text', value: '. ' },
      { type: 'text', value: 'Параметры: ' },
      { type: 'field', key: 'questionsCount', label: 'Вопросов', placeholder: '10' },
      { type: 'text', value: ' вопросов, по ' },
      { type: 'field', key: 'answersCount', label: 'Ответов', placeholder: '4' },
      { type: 'text', value: ' ответа.' }
    ],
    fields: [
      { key: 'subject', label: 'Предмет', type: 'text', placeholder: 'Биология' },
      { key: 'topic', label: 'Тема', type: 'text', placeholder: 'Клетка' },
      {
        key: 'level',
        label: 'Класс',
        type: 'select',
        options: Array.from({ length: 11 }, (_, i) => ({
          value: String(i + 1),
          label: `${i + 1} класс`
        }))
      },
      { key: 'questionsCount', label: 'Кол-во вопросов', type: 'number', min: 1, max: 30 },
      { key: 'answersCount', label: 'Вариантов ответа', type: 'number', min: 2, max: 6 }
    ]
  },
  vocabulary: {
    segments: [
      { type: 'text', value: 'Создай учебный словарь по теме ' },
      { type: 'field', key: 'topic', label: 'Тема', placeholder: 'Тема' },
      { type: 'text', value: ' на ' },
      { type: 'field', key: 'language', label: 'Язык', placeholder: 'язык' },
      { type: 'text', value: ' языке. ' },
      { type: 'text', value: 'Количество слов: ' },
      { type: 'field', key: 'wordsCount', label: 'Слов', placeholder: '20' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'topic', label: 'Тема', type: 'text', placeholder: 'Путешествия' },
      {
        key: 'language',
        label: 'Язык',
        type: 'select',
        options: [
          { value: 'en', label: 'Английский' },
          { value: 'de', label: 'Немецкий' },
          { value: 'fr', label: 'Французский' },
          { value: 'es', label: 'Испанский' },
          { value: 'it', label: 'Итальянский' },
          { value: 'pt', label: 'Португальский' },
          { value: 'zh', label: 'Китайский' },
          { value: 'ja', label: 'Японский' },
          { value: 'ko', label: 'Корейский' },
          { value: 'ar', label: 'Арабский' },
          { value: 'tr', label: 'Турецкий' },
          { value: 'pl', label: 'Польский' },
          { value: 'nl', label: 'Голландский' },
          { value: 'sv', label: 'Шведский' },
          { value: 'no', label: 'Норвежский' },
          { value: 'da', label: 'Датский' },
          { value: 'fi', label: 'Финский' },
          { value: 'cs', label: 'Чешский' },
          { value: 'hu', label: 'Венгерский' },
          { value: 'ro', label: 'Румынский' },
          { value: 'el', label: 'Греческий' },
          { value: 'he', label: 'Иврит' },
          { value: 'hi', label: 'Хинди' },
          { value: 'th', label: 'Тайский' },
          { value: 'vi', label: 'Вьетнамский' }
        ]
      },
      { key: 'wordsCount', label: 'Количество слов', type: 'number', min: 5, max: 50 }
    ]
  },
  lessonPlan: {
    segments: [
      { type: 'text', value: 'Нужен подробный план урока по предмету ' },
      { type: 'field', key: 'subject', label: 'Предмет', placeholder: 'Предмет' },
      { type: 'text', value: ' на тему ' },
      { type: 'field', key: 'topic', label: 'Тема', placeholder: 'Тема' },
      { type: 'text', value: ' для ' },
      { type: 'field', key: 'level', label: 'Класс', placeholder: 'класс' },
      { type: 'text', value: ' класса, длительность ' },
      { type: 'field', key: 'duration', label: 'Длительность', placeholder: '45' },
      { type: 'text', value: ' минут.' }
    ],
    fields: [
      { key: 'subject', label: 'Предмет', type: 'text', placeholder: 'История' },
      { key: 'topic', label: 'Тема', type: 'text', placeholder: 'Реформы Петра I' },
      {
        key: 'level',
        label: 'Класс',
        type: 'select',
        options: Array.from({ length: 11 }, (_, i) => ({
          value: String(i + 1),
          label: `${i + 1} класс`
        }))
      },
      { key: 'duration', label: 'Длительность (мин)', type: 'number', min: 15, max: 120 },
      { key: 'objectives', label: 'Цели (необязательно)', type: 'textarea', rows: 2, placeholder: '2-3 цели урока' }
    ]
  },
  content: {
    segments: [
      { type: 'text', value: 'Адаптируй этот текст: ' },
      { type: 'field', key: 'text', label: 'Текст', placeholder: 'Вставьте текст' },
      { type: 'text', value: '. Действие: ' },
      { type: 'field', key: 'action', label: 'Действие', placeholder: 'simplify/summary' },
      { type: 'text', value: ', уровень ' },
      { type: 'field', key: 'level', label: 'Класс', placeholder: 'класс' },
      { type: 'text', value: '.' }
    ],
    fields: [
      {
        key: 'action',
        label: 'Действие',
        type: 'select',
        options: [
          { value: 'simplify', label: 'Упростить' },
          { value: 'summary', label: 'Саммари' },
          { value: 'questions', label: 'Вопросы' },
          { value: 'keypoints', label: 'Ключевые пункты' }
        ]
      },
      { key: 'text', label: 'Текст', type: 'textarea', rows: 3, placeholder: 'Вставьте исходный текст' },
      {
        key: 'level',
        label: 'Класс',
        type: 'select',
        options: Array.from({ length: 11 }, (_, i) => ({
          value: String(i + 1),
          label: `${i + 1} класс`
        }))
      }
    ]
  },
  feedback: {
    segments: [
      { type: 'text', value: 'Дай подробную обратную связь по ' },
      { type: 'field', key: 'taskType', label: 'Тип работы', placeholder: 'эссе/задача' },
      { type: 'text', value: '. Работа ученика: ' },
      { type: 'field', key: 'studentWork', label: 'Работа', placeholder: 'текст работы' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'taskType', label: 'Тип задания', type: 'text', placeholder: 'эссе, решение задачи...' },
      { key: 'studentWork', label: 'Текст работы', type: 'textarea', rows: 4, placeholder: 'Вставьте ответ ученика' },
      {
        key: 'level',
        label: 'Класс (необязательно)',
        type: 'select',
        options: [
          { value: '', label: '—' },
          ...Array.from({ length: 11 }, (_, i) => ({
            value: String(i + 1),
            label: `${i + 1} класс`
          }))
        ]
      }
    ]
  },
  presentation: {
    segments: [
      { type: 'text', value: 'Создай презентацию по тексту: ' },
      { type: 'field', key: 'inputText', label: 'Текст', placeholder: 'вставьте текст' },
      { type: 'text', value: ', слайдов: ' },
      { type: 'field', key: 'numCards', label: 'Слайдов', placeholder: '10' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'inputText', label: 'ТЕКСТ/ТЕЗИСЫ', type: 'textarea', rows: 3, placeholder: 'О чём презентация' },
      { key: 'numCards', label: 'КОЛИЧЕСТВО СЛАЙДОВ', type: 'number', min: 3, max: 60 },
      {
        key: 'exportAs',
        label: 'ЭКСПОРТ',
        type: 'select',
        options: [
          { value: 'pdf', label: 'PDF' },
          { value: 'pptx', label: 'PPTX' }
        ]
      },
      {
        key: 'textAmount',
        label: 'ОБЪЁМ ТЕКСТА',
        type: 'select',
        options: [
          { value: 'brief', label: 'Кратко' },
          { value: 'medium', label: 'Средне' },
          { value: 'detailed', label: 'Подробно' },
          { value: 'extensive', label: 'Максимально подробно' }
        ]
      },
      {
        key: 'tone',
        label: 'ТОН (необязательно)',
        type: 'select',
        options: [
          { value: '', label: '— Не выбрано' },
          { value: 'professional', label: 'Профессиональный' },
          { value: 'inspiring', label: 'Вдохновляющий' },
          { value: 'friendly', label: 'Дружелюбный' },
          { value: 'authoritative', label: 'Авторитетный' },
          { value: 'casual', label: 'Неформальный' },
          { value: 'educational', label: 'Образовательный' },
          { value: 'motivational', label: 'Мотивирующий' },
          { value: 'analytical', label: 'Аналитический' },
          { value: 'creative', label: 'Креативный' },
          { value: 'confident', label: 'Уверенный' }
        ]
      },
      {
        key: 'audience',
        label: 'АУДИТОРИЯ (необязательно)',
        type: 'select',
        options: [
          { value: '', label: '— Не выбрано' },
          { value: 'teachers', label: 'Учителя' },
          { value: 'students', label: 'Студенты' },
          { value: 'parents', label: 'Родители' },
          { value: 'professionals', label: 'Профессионалы' },
          { value: 'managers', label: 'Менеджеры' },
          { value: 'children', label: 'Дети' },
          { value: 'teenagers', label: 'Подростки' },
          { value: 'adults', label: 'Взрослые' },
          { value: 'seniors', label: 'Пожилые люди' },
          { value: 'general', label: 'Общая аудитория' }
        ]
      },
      {
        key: 'imageSource',
        label: 'ИСТОЧНИК ИЗОБРАЖЕНИЙ',
        type: 'select',
        options: [
          { value: 'aiGenerated', label: 'AI генерация' },
          { value: 'pictographic', label: 'Пиктограммы' },
          { value: 'unsplash', label: 'Unsplash' },
          { value: 'webFreeToUse', label: 'Бесплатные из интернета' },
          { value: 'noImages', label: 'Без изображений' }
        ]
      },
      { key: 'additionalInstructions', label: 'ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ (необязательно)', type: 'textarea', rows: 2, placeholder: 'Особые требования к презентации...' }
    ]
  },
  image: {
    segments: [
      { type: 'text', value: 'Сгенерируй изображение по описанию: ' },
      { type: 'field', key: 'prompt', label: 'Описание', placeholder: 'подробное описание' },
      { type: 'text', value: '. Стиль: ' },
      { type: 'field', key: 'style', label: 'Стиль', placeholder: 'realistic' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'prompt', label: 'Описание', type: 'textarea', rows: 3, placeholder: 'Что нужно изобразить' },
      {
        key: 'style',
        label: 'Стиль',
        type: 'select',
        options: [
          { value: 'realistic', label: 'Реалистичный' },
          { value: 'cartoon', label: 'Мультяшный' },
          { value: 'sketch', label: 'Эскиз' },
          { value: 'illustration', label: 'Иллюстрация' }
        ]
      }
    ]
  },
  photosession: {
    segments: [
      { type: 'text', value: 'Создай AI фотосессию со стилем ' },
      { type: 'field', key: 'style', label: 'Стиль', placeholder: 'realistic' },
      { type: 'text', value: ' с готовым промптом ' },
      { type: 'field', key: 'prompt', label: 'Промпт', placeholder: 'Выберите промпт' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'photoHash', label: 'Загрузить фото', type: 'file', accept: 'image/*' },
      {
        key: 'style',
        label: 'Стиль',
        type: 'select',
        options: [
          { value: 'realistic', label: 'Реалистичный' },
          { value: 'artistic', label: 'Художественный' },
          { value: 'professional', label: 'Профессиональный' },
          { value: 'creative', label: 'Креативный' }
        ]
      },
      {
        key: 'size',
        label: 'Размер',
        type: 'select',
        options: [
          { value: '1024x1024', label: 'Квадрат (1024x1024)' },
          { value: '1024x1792', label: 'Портрет (1024x1792)' },
          { value: '1792x1024', label: 'Ландшафт (1792x1024)' }
        ]
      },
      {
        key: 'prompt',
        label: 'Описание желаемого результата',
        type: 'select',
        options: photosessionPrompts
      }
    ]
  },
  transcription: {
    segments: [
      { type: 'text', value: 'Транскрибируй видео ' },
      { type: 'field', key: 'videoHash', label: 'Видео', placeholder: 'файл' },
      { type: 'text', value: ' по предмету ' },
      { type: 'field', key: 'subject', label: 'Предмет', placeholder: 'предмет' },
      { type: 'text', value: ' на языке ' },
      { type: 'field', key: 'language', label: 'Язык', placeholder: 'ru' },
      { type: 'text', value: '.' }
    ],
    fields: [
      { key: 'videoHash', label: 'Видео', type: 'file', accept: 'video/*', placeholder: 'Выберите видео файл' },
      { key: 'subject', label: 'Предмет', type: 'text', placeholder: 'Информатика' },
      {
        key: 'language',
        label: 'Язык',
        type: 'select',
        options: [
          { value: 'ru', label: 'Русский' },
          { value: 'en', label: 'Английский' }
        ]
      }
    ]
  },
  message: {
    segments: [
      { type: 'text', value: 'Создай сообщение по шаблону ' },
      { type: 'field', key: 'templateId', label: 'Шаблон', placeholder: 'meeting' },
      { type: 'text', value: ' с готовым промптом ' },
      { type: 'field', key: 'formData', label: 'Промпт', placeholder: 'Выберите промпт' },
      { type: 'text', value: '.' }
    ],
    fields: [
      {
        key: 'templateId',
        label: 'Шаблон',
        type: 'select',
        options: [
          { value: 'meeting', label: 'Приглашение на собрание' },
          { value: 'progress', label: 'Отчёт об успеваемости' },
          { value: 'reminder', label: 'Напоминание' },
          { value: 'thank-you', label: 'Благодарность' }
        ]
      },
      { key: 'formData', label: 'Данные (JSON)', type: 'textarea', rows: 4, placeholder: '{ "date": "...", "topic": "..." }' }
    ]
  },
  gigachat: {
    segments: [
      { type: 'text', value: 'Запусти ' },
      { type: 'field', key: 'mode', label: 'Режим', placeholder: 'чат' },
      { type: 'text', value: ' в GigaChat c моделью ' },
      { type: 'field', key: 'model', label: 'Модель', placeholder: 'GigaChat' },
      { type: 'text', value: '.' }
    ],
    fields: [
      {
        key: 'mode',
        label: 'Режим GigaChat',
        type: 'select',
        options: [
          { value: 'chat', label: 'Текстовая беседа' },
          { value: 'image', label: 'Генерация изображения' },
          { value: 'embeddings', label: 'Эмбеддинги' },
          { value: 'audio_speech', label: 'Текст → речь' },
          { value: 'audio_transcription', label: 'Расшифровка аудио' },
          { value: 'audio_transcription', label: 'Расшифровка аудио' },
          { value: 'audio_translation', label: 'Перевод аудио' },
          { value: 'tokens_count', label: 'Подсчет токенов' }
        ]
      },
      {
        key: 'model',
        label: 'Модель GigaChat',
        type: 'select',
        options: [
          { value: 'GigaChat', label: 'GigaChat' },
          { value: 'GigaChat-Pro', label: 'GigaChat-Pro' }
        ],
        helperText: 'Модели подгружаются автоматически, можно выбрать вручную'
      },
      {
        key: 'systemPrompt',
        label: 'System prompt',
        type: 'textarea',
        rows: 2,
        placeholder: 'Опишите роль ассистента',
        showWhen: { field: 'mode', equals: 'chat' }
      },
      {
        key: 'userPrompt',
        label: 'Пользовательский запрос',
        type: 'textarea',
        rows: 4,
        placeholder: 'Что нужно сгенерировать',
        showWhen: { field: 'mode', equals: 'chat' }
      },
      {
        key: 'temperature',
        label: 'Temperature',
        type: 'number',
        min: 0,
        max: 2,
        step: 0.1,
        helperText: 'От 0 до 2, выше — креативнее',
        showWhen: { field: 'mode', equals: 'chat' }
      },
      {
        key: 'topP',
        label: 'Top P',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.05,
        helperText: 'Nucleus sampling',
        showWhen: { field: 'mode', equals: 'chat' }
      },
      {
        key: 'maxTokens',
        label: 'Max tokens',
        type: 'number',
        min: 64,
        max: 4096,
        helperText: 'Ограничение длины ответа',
        showWhen: { field: 'mode', equals: 'chat' }
      },
      {
        key: 'prompt',
        label: 'Описание изображения',
        type: 'textarea',
        rows: 3,
        placeholder: 'Подробно опишите сцену',
        showWhen: { field: 'mode', equals: 'image' }
      },
      {
        key: 'negativePrompt',
        label: 'Негативный промпт',
        type: 'text',
        placeholder: 'Что нужно исключить',
        showWhen: { field: 'mode', equals: 'image' }
      },
      {
        key: 'size',
        label: 'Размер',
        type: 'select',
        options: [
          { value: '1024x1024', label: '1024x1024' },
          { value: '1792x1024', label: '1792x1024' },
          { value: '1024x1792', label: '1024x1792' }
        ],
        showWhen: { field: 'mode', equals: 'image' }
      },
      {
        key: 'quality',
        label: 'Качество',
        type: 'select',
        options: [
          { value: 'high', label: 'High' },
          { value: 'standard', label: 'Standard' }
        ],
        showWhen: { field: 'mode', equals: 'image' }
      },
      {
        key: 'inputText',
        label: 'Текст',
        type: 'textarea',
        rows: 3,
        placeholder: 'Введите текст',
        showWhen: { field: 'mode', in: ['embeddings', 'audio_speech', 'tokens_count'] }
      },
      {
        key: 'voice',
        label: 'Голос',
        type: 'select',
        options: [
          { value: 'BYS', label: 'BYS (мужской)' },
          { value: 'TATYANA', label: 'TATYANA (женский)' },
          { value: 'VOICE_3', label: 'VOICE 3' }
        ],
        showWhen: { field: 'mode', equals: 'audio_speech' }
      },
      {
        key: 'audioFormat',
        label: 'Формат аудио',
        type: 'select',
        options: [
          { value: 'mp3', label: 'MP3' },
          { value: 'wav', label: 'WAV' },
          { value: 'ogg', label: 'OGG' }
        ],
        showWhen: { field: 'mode', equals: 'audio_speech' }
      },
      {
        key: 'audioSpeed',
        label: 'Скорость речи',
        type: 'number',
        min: 0.5,
        max: 2,
        step: 0.1,
        showWhen: { field: 'mode', equals: 'audio_speech' }
      },
      {
        key: 'audioHash',
        label: 'Аудио файл',
        type: 'file',
        accept: 'audio/*',
        showWhen: { field: 'mode', in: ['audio_transcription', 'audio_translation'] }
      },
      {
        key: 'language',
        label: 'Язык записи',
        type: 'select',
        options: [
          { value: 'ru', label: 'Русский' },
          { value: 'en', label: 'Английский' },
          { value: 'es', label: 'Испанский' },
          { value: 'de', label: 'Немецкий' }
        ],
        showWhen: { field: 'mode', equals: 'audio_transcription' }
      },
      {
        key: 'targetLanguage',
        label: 'Целевой язык',
        type: 'select',
        options: [
          { value: 'ru', label: 'Русский' },
          { value: 'en', label: 'Английский' },
          { value: 'es', label: 'Испанский' },
          { value: 'de', label: 'Немецкий' }
        ],
        showWhen: { field: 'mode', equals: 'audio_translation' }
      }
    ]
  }
}

// Готовые промпты для сообщений
export const messagePrompts: Record<string, FieldOption[]> = {
  meeting: [
    {
      label: 'Собрание по итогам четверти',
      value: JSON.stringify({ date: '25 декабря 2024, 18:00', topic: 'Итоги первой четверти', location: 'Актовый зал школы' })
    },
    {
      label: 'Собрание по подготовке к экзаменам',
      value: JSON.stringify({ date: '15 января 2025, 19:00', topic: 'Подготовка к ОГЭ и ЕГЭ', location: 'Кабинет 205' })
    },
    {
      label: 'Собрание по внеклассной работе',
      value: JSON.stringify({ date: '10 февраля 2025, 17:30', topic: 'Планирование внеклассных мероприятий', location: 'Учительская' })
    },
    {
      label: 'Собрание по безопасности',
      value: JSON.stringify({ date: '5 марта 2025, 18:30', topic: 'Безопасность детей в школе и дома', location: 'Актовый зал школы' })
    }
  ],
  progress: [
    {
      label: 'Отличные результаты по математике',
      value: JSON.stringify({ studentName: 'Иванов Иван', subject: 'Математика', achievements: 'Успешно решает задачи повышенной сложности, активно участвует в олимпиадах', recommendations: 'Продолжать развивать логическое мышление, участвовать в математических конкурсах' })
    },
    {
      label: 'Хороший прогресс по русскому языку',
      value: JSON.stringify({ studentName: 'Петрова Мария', subject: 'Русский язык', achievements: 'Улучшила грамотность, стала лучше писать сочинения', recommendations: 'Больше читать художественную литературу, практиковаться в написании изложений' })
    },
    {
      label: 'Успехи по английскому языку',
      value: JSON.stringify({ studentName: 'Сидоров Алексей', subject: 'Английский язык', achievements: 'Расширил словарный запас, улучшил произношение', recommendations: 'Смотреть фильмы на английском, общаться с носителями языка' })
    },
    {
      label: 'Достижения по биологии',
      value: JSON.stringify({ studentName: 'Козлова Анна', subject: 'Биология', achievements: 'Отлично усваивает материал, проявляет интерес к исследовательской работе', recommendations: 'Участвовать в научных проектах, посещать биологические кружки' })
    }
  ],
  reminder: [
    {
      label: 'Напоминание о контрольной работе',
      value: JSON.stringify({ event: 'Контрольная работа по алгебре', date: '20 декабря 2024', details: 'Тема: "Квадратные уравнения". Принести калькулятор и черновик' })
    },
    {
      label: 'Напоминание о родительском собрании',
      value: JSON.stringify({ event: 'Родительское собрание', date: '28 декабря 2024, 18:00', details: 'Обсуждение итогов четверти и планов на каникулы' })
    },
    {
      label: 'Напоминание о сдаче проекта',
      value: JSON.stringify({ event: 'Сдача проекта по истории', date: '15 января 2025', details: 'Тема: "Великая Отечественная война". Объем: 10-15 страниц, презентация обязательна' })
    },
    {
      label: 'Напоминание об экскурсии',
      value: JSON.stringify({ event: 'Экскурсия в музей', date: '12 февраля 2025, 10:00', details: 'Музей истории города. Сбор у главного входа школы. Взять с собой сменную обувь' })
    }
  ],
  'thank-you': [
    {
      label: 'Благодарность за помощь в организации мероприятия',
      value: JSON.stringify({ recipient: 'Родительскому комитету', reason: 'За помощь в организации новогоднего праздника и подготовку подарков для детей' })
    },
    {
      label: 'Благодарность за участие в субботнике',
      value: JSON.stringify({ recipient: 'Ученикам и родителям', reason: 'За активное участие в школьном субботнике и благоустройство территории' })
    },
    {
      label: 'Благодарность за спонсорскую помощь',
      value: JSON.stringify({ recipient: 'ООО "Образование"', reason: 'За спонсорскую помощь в приобретении учебных материалов и оборудования для кабинета' })
    },
    {
      label: 'Благодарность за волонтерскую работу',
      value: JSON.stringify({ recipient: 'Волонтерам школы', reason: 'За помощь в организации благотворительной акции и сбор средств для нуждающихся семей' })
    }
  ]
}



