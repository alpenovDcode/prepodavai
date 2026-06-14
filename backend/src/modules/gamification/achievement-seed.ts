/**
 * Каталог ачивок — сидится при старте через AchievementSeedService.
 * Изменения здесь применяются к БД автоматически на следующем старте сервиса
 * (idempotent upsert по ключу).
 */
export const ACHIEVEMENT_SEED: Array<{
  key: string;
  title: string;
  description: string;
  category: 'streak' | 'grade' | 'subject' | 'game' | 'social';
  conditionField: 'submittedCount' | 'streakDays' | 'gradedCount' | 'perfectCount';
  conditionValue: number;
  xpReward: number;
  iconKey: string;
  color: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'indigo';
  emoji: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  sortOrder: number;
}> = [
  // ─── 🔥 Стрики и постоянство ──────────────────────────────────
  { key: 'streak-3',     title: 'Огонёк',            description: '3 дня подряд заходите учиться',           category: 'streak',  conditionField: 'streakDays',     conditionValue: 3,    xpReward: 50,   iconKey: 'flame',     color: 'warning', emoji: '🔥',  rarity: 'common',    sortOrder: 10 },
  { key: 'streak-7',     title: 'Неделя огня',        description: '7 дней подряд без пропусков',             category: 'streak',  conditionField: 'streakDays',     conditionValue: 7,    xpReward: 100,  iconKey: 'flame',     color: 'danger',  emoji: '🔥',  rarity: 'common',    sortOrder: 20 },
  { key: 'streak-14',    title: 'Несгораемый',        description: '14 дней подряд',                          category: 'streak',  conditionField: 'streakDays',     conditionValue: 14,   xpReward: 250,  iconKey: 'flame',     color: 'brand',   emoji: '🌟',  rarity: 'rare',      sortOrder: 30 },
  { key: 'streak-30',    title: 'Месяц без пропуска', description: '30 дней подряд каждый день что-то делать',category: 'streak',  conditionField: 'streakDays',     conditionValue: 30,   xpReward: 500,  iconKey: 'flame',     color: 'brand',   emoji: '🏔',  rarity: 'epic',      sortOrder: 40 },
  { key: 'streak-100',   title: 'Алмаз воли',         description: '100 дней подряд. Реально круто.',         category: 'streak',  conditionField: 'streakDays',     conditionValue: 100,  xpReward: 2000, iconKey: 'flame',     color: 'indigo',  emoji: '💎',  rarity: 'legendary', sortOrder: 50 },
  { key: 'fast-1',       title: 'В тот же день',      description: 'Сдать домашку в день получения',          category: 'streak',  conditionField: 'submittedCount', conditionValue: 1,    xpReward: 30,   iconKey: 'zap',       color: 'info',    emoji: '⚡',  rarity: 'common',    sortOrder: 60 },
  { key: 'fast-5',       title: 'Скоростник',         description: '5 домашек подряд сданы в день получения', category: 'streak',  conditionField: 'submittedCount', conditionValue: 5,    xpReward: 150,  iconKey: 'zap',       color: 'info',    emoji: '⚡',  rarity: 'rare',      sortOrder: 70 },
  { key: 'fast-10',      title: 'Молния',             description: '10 домашек в день получения',             category: 'streak',  conditionField: 'submittedCount', conditionValue: 10,   xpReward: 200,  iconKey: 'zap',       color: 'info',    emoji: '⚡',  rarity: 'rare',      sortOrder: 80 },
  { key: 'night-owl',    title: 'Сова',               description: 'Учиться 5 раз после 22:00 (вредно, но эпично)', category: 'streak', conditionField: 'submittedCount', conditionValue: 9999, xpReward: 400, iconKey: 'zap', color: 'indigo', emoji: '🦉', rarity: 'epic', sortOrder: 90 },
  { key: 'early-bird',   title: 'Ранняя пташка',      description: '5 раз учиться до 7:00 утра',              category: 'streak',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 400,  iconKey: 'zap',       color: 'indigo',  emoji: '🌅',  rarity: 'epic',      sortOrder: 100 },

  // ─── ⭐ Оценки и баллы ──────────────────────────────────────────
  { key: 'grade-first',      title: 'Первая пятёрка',    description: 'Получить первую отличную оценку',        category: 'grade',   conditionField: 'perfectCount',   conditionValue: 1,    xpReward: 25,   iconKey: 'star',      color: 'warning', emoji: '⭐',  rarity: 'common',    sortOrder: 110 },
  { key: 'grade-3',          title: 'Три пятёрки подряд',description: '3 отличные оценки одна за другой',       category: 'grade',   conditionField: 'perfectCount',   conditionValue: 3,    xpReward: 75,   iconKey: 'star',      color: 'warning', emoji: '⭐',  rarity: 'common',    sortOrder: 120 },
  { key: 'grade-10',         title: 'Звёздная серия',    description: '10 пятёрок подряд',                      category: 'grade',   conditionField: 'perfectCount',   conditionValue: 10,   xpReward: 200,  iconKey: 'star',      color: 'success', emoji: '🌟',  rarity: 'rare',      sortOrder: 130 },
  { key: 'grade-100pct',     title: 'Сотка!',            description: 'Тест на 100% правильных ответов',        category: 'grade',   conditionField: 'gradedCount',    conditionValue: 5,    xpReward: 150,  iconKey: 'star',      color: 'success', emoji: '💯',  rarity: 'rare',      sortOrder: 140 },
  { key: 'grade-perfect-5',  title: 'Идеальный',         description: '5 тестов подряд на 100%',                category: 'grade',   conditionField: 'gradedCount',    conditionValue: 25,   xpReward: 400,  iconKey: 'star',      color: 'success', emoji: '💯',  rarity: 'epic',      sortOrder: 150 },
  { key: 'grade-no-mistake', title: 'Без единой ошибки', description: 'Неделя без снижения балла',              category: 'grade',   conditionField: 'gradedCount',    conditionValue: 9999, xpReward: 500,  iconKey: 'award',     color: 'indigo',  emoji: '🎯',  rarity: 'epic',      sortOrder: 160 },
  { key: 'grade-king',       title: 'Король четверти',   description: 'Средний балл 5.0 за всю четверть',       category: 'grade',   conditionField: 'perfectCount',   conditionValue: 50,   xpReward: 1500, iconKey: 'trophy',    color: 'indigo',  emoji: '👑',  rarity: 'legendary', sortOrder: 170 },
  { key: 'grade-up',         title: 'Подтянулся',        description: 'Поднять средний балл на 0,5',            category: 'grade',   conditionField: 'gradedCount',    conditionValue: 10,   xpReward: 120,  iconKey: 'award',     color: 'brand',   emoji: '📈',  rarity: 'rare',      sortOrder: 180 },
  { key: 'grade-revenge',    title: 'Реванш',            description: 'Исправить двойку на пятёрку с первой попытки', category: 'grade', conditionField: 'gradedCount', conditionValue: 9999, xpReward: 200, iconKey: 'award', color: 'danger', emoji: '🔄', rarity: 'rare', sortOrder: 190 },

  // ─── 📚 Объём работы ────────────────────────────────────────────
  { key: 'submit-first',  title: 'Старт',       description: 'Сделать первую домашку',          category: 'subject', conditionField: 'submittedCount', conditionValue: 1,    xpReward: 20,   iconKey: 'book-open', color: 'brand',   emoji: '📖',  rarity: 'common',    sortOrder: 200 },
  { key: 'submit-10',     title: 'Десятка',     description: '10 заданий выполнено',             category: 'subject', conditionField: 'submittedCount', conditionValue: 10,   xpReward: 50,   iconKey: 'book-open', color: 'brand',   emoji: '📚',  rarity: 'common',    sortOrder: 210 },
  { key: 'submit-50',     title: 'Полусотня',   description: '50 заданий выполнено',             category: 'subject', conditionField: 'submittedCount', conditionValue: 50,   xpReward: 120,  iconKey: 'book-open', color: 'info',    emoji: '📚',  rarity: 'common',    sortOrder: 220 },
  { key: 'submit-100',    title: 'Сотня',       description: '100 заданий выполнено',            category: 'subject', conditionField: 'submittedCount', conditionValue: 100,  xpReward: 300,  iconKey: 'trophy',    color: 'warning', emoji: '🎓',  rarity: 'rare',      sortOrder: 230 },
  { key: 'submit-500',    title: 'Марафонец',   description: '500 заданий выполнено',            category: 'subject', conditionField: 'submittedCount', conditionValue: 500,  xpReward: 800,  iconKey: 'trophy',    color: 'danger',  emoji: '🏆',  rarity: 'epic',      sortOrder: 240 },
  { key: 'submit-1000',   title: 'Тысячник',    description: '1 000 заданий выполнено. Космос.',  category: 'subject', conditionField: 'submittedCount', conditionValue: 1000, xpReward: 3000, iconKey: 'trophy',    color: 'indigo',  emoji: '🌌',  rarity: 'legendary', sortOrder: 250 },
  { key: 'multi-5',       title: 'Многостаночник', description: 'Сделать задания по 5 разным предметам', category: 'subject', conditionField: 'submittedCount', conditionValue: 9999, xpReward: 100, iconKey: 'book-open', color: 'info', emoji: '🧠', rarity: 'rare', sortOrder: 260 },
  { key: 'multi-10',      title: 'Эрудит',      description: 'Задания по 10 разным предметам',  category: 'subject', conditionField: 'submittedCount', conditionValue: 9999, xpReward: 300,  iconKey: 'book-open', color: 'indigo',  emoji: '🧬',  rarity: 'epic',      sortOrder: 270 },

  // ─── 🎯 Точность и скорость ─────────────────────────────────────
  { key: 'game-sprint',    title: 'Спринтер',          description: 'Тест за половину отведённого времени',        category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 150,  iconKey: 'zap',   color: 'info',    emoji: '⏱',  rarity: 'rare',      sortOrder: 280 },
  { key: 'game-racer',     title: 'Гонщик',            description: '5 тестов на скорость подряд',                 category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 200,  iconKey: 'zap',   color: 'info',    emoji: '🏎',  rarity: 'rare',      sortOrder: 290 },
  { key: 'game-sniper',    title: 'Снайпер',           description: '10 правильных ответов подряд в тесте',        category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 180,  iconKey: 'target', color: 'success', emoji: '🎯', rarity: 'rare',      sortOrder: 300 },
  { key: 'game-no-miss',   title: 'Без единого промаха',description: '25 правильных ответов подряд в одном тесте', category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 500,  iconKey: 'target', color: 'indigo', emoji: '🎖',  rarity: 'epic',      sortOrder: 310 },
  { key: 'game-first',     title: 'Первый из класса',  description: 'Сдать тест раньше всех в классе',             category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 400,  iconKey: 'zap',   color: 'brand',   emoji: '🚀',  rarity: 'epic',      sortOrder: 320 },
  { key: 'game-lightning', title: 'Молниеносный',      description: 'Тест за треть времени и на 100%',             category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 600,  iconKey: 'zap',   color: 'indigo',  emoji: '⏱',  rarity: 'epic',      sortOrder: 330 },
  { key: 'game-thinker',   title: 'Мыслитель',         description: 'Использовать ИИ-учителя 10 раз',              category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 150,  iconKey: 'target', color: 'info',   emoji: '🤔',  rarity: 'rare',      sortOrder: 340 },
  { key: 'game-no-error',  title: 'Безошибочный месяц', description: 'Целый месяц без ошибок в тестах',            category: 'game',    conditionField: 'submittedCount', conditionValue: 9999, xpReward: 1200, iconKey: 'trophy', color: 'indigo', emoji: '🧠',  rarity: 'legendary', sortOrder: 350 },

  // ─── 💎 Редкие и секретные ──────────────────────────────────────
  { key: 'social-helper',    title: 'Помощник',              description: 'Помочь однокласснику с заданием',              category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 250,  iconKey: 'award',  color: 'success', emoji: '🤝',  rarity: 'rare',      sortOrder: 360 },
  { key: 'social-week',      title: 'Ученик недели',         description: 'Учитель отметил вас как ученика недели',       category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 600,  iconKey: 'trophy', color: 'brand',   emoji: '🌟',  rarity: 'epic',      sortOrder: 370 },
  { key: 'social-curious',   title: 'Дотошный',              description: 'Задать 25 вопросов ИИ-учителю',                category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 500,  iconKey: 'target', color: 'info',    emoji: '📨',  rarity: 'epic',      sortOrder: 380 },
  { key: 'social-birthday',  title: 'День рождения',         description: 'Учиться в свой день рождения',                 category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 100,  iconKey: 'award',  color: 'warning', emoji: '🎂',  rarity: 'rare',      sortOrder: 390 },
  { key: 'social-holiday',   title: 'Учу даже на каникулах', description: 'Сделать задание в каникулы (никто не заставлял)', category: 'social', conditionField: 'submittedCount', conditionValue: 9999, xpReward: 400, iconKey: 'award', color: 'brand', emoji: '🎄', rarity: 'epic', sortOrder: 400 },
  { key: 'social-class-king',title: 'Король четверти',       description: 'Первое место в классе по итогам четверти',     category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 2500, iconKey: 'trophy', color: 'warning', emoji: '🏆', rarity: 'legendary', sortOrder: 410 },
  { key: 'social-school-king',title: 'Король школы',         description: 'Первое место в параллели',                     category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 5000, iconKey: 'trophy', color: 'indigo',  emoji: '👑',  rarity: 'legendary', sortOrder: 420 },
  { key: 'social-secret-1',  title: '???',                   description: 'Секретная награда — узнаете когда получите',   category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 500,  iconKey: 'award',  color: 'indigo',  emoji: '🔮',  rarity: 'epic',      sortOrder: 430 },
  { key: 'social-secret-2',  title: '???',                   description: 'Скрытая, легендарная награда',                 category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 1000, iconKey: 'trophy', color: 'indigo',  emoji: '🔮',  rarity: 'legendary', sortOrder: 440 },
  { key: 'social-olympiad',  title: 'Победитель олимпиады',  description: 'Победить в школьной олимпиаде',                category: 'social',  conditionField: 'submittedCount', conditionValue: 9999, xpReward: 3000, iconKey: 'trophy', color: 'indigo',  emoji: '🌙',  rarity: 'legendary', sortOrder: 450 },
];
