/**
 * Каталог ачивок — сидится при старте через AchievementSeedService.
 * Изменения здесь применяются к БД автоматически на следующем старте сервиса
 * (idempotent upsert по ключу).
 */
export const ACHIEVEMENT_SEED: Array<{
  key: string;
  title: string;
  description: string;
  category: 'submissions' | 'streak' | 'grades' | 'general';
  conditionField: 'submittedCount' | 'streakDays' | 'gradedCount' | 'perfectCount';
  conditionValue: number;
  xpReward: number;
  iconKey: string;
  color: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'indigo';
  sortOrder: number;
}> = [
  // Submissions
  { key: 'first-step',  title: 'Первый шаг',     description: 'Сдать первое задание',         category: 'submissions', conditionField: 'submittedCount', conditionValue: 1,  xpReward: 50,   iconKey: 'zap',       color: 'brand',   sortOrder: 10 },
  { key: 'pupil-10',    title: 'Усердный ученик', description: 'Сдать 10 заданий',             category: 'submissions', conditionField: 'submittedCount', conditionValue: 10, xpReward: 100,  iconKey: 'book-open', color: 'info',    sortOrder: 20 },
  { key: 'pupil-50',    title: 'Мастер заданий',  description: 'Сдать 50 заданий',             category: 'submissions', conditionField: 'submittedCount', conditionValue: 50, xpReward: 500,  iconKey: 'trophy',    color: 'warning', sortOrder: 30 },

  // Streak
  { key: 'streak-3',    title: 'Огонёк',          description: 'Заниматься 3 дня подряд',     category: 'streak',      conditionField: 'streakDays',     conditionValue: 3,  xpReward: 50,   iconKey: 'flame',     color: 'warning', sortOrder: 40 },
  { key: 'streak-7',    title: 'Неделя силы',     description: 'Заниматься 7 дней подряд',    category: 'streak',      conditionField: 'streakDays',     conditionValue: 7,  xpReward: 200,  iconKey: 'flame',     color: 'danger',  sortOrder: 50 },
  { key: 'streak-30',   title: 'Месяц упорства',  description: 'Заниматься 30 дней подряд',   category: 'streak',      conditionField: 'streakDays',     conditionValue: 30, xpReward: 1000, iconKey: 'flame',     color: 'brand',   sortOrder: 60 },

  // Grades
  { key: 'perfect-1',   title: 'Отличник',        description: 'Получить пятёрку',            category: 'grades',      conditionField: 'perfectCount',   conditionValue: 1,  xpReward: 100,  iconKey: 'star',      color: 'success', sortOrder: 70 },
  { key: 'perfect-10',  title: 'Чемпион',         description: 'Получить 10 пятёрок',         category: 'grades',      conditionField: 'perfectCount',   conditionValue: 10, xpReward: 500,  iconKey: 'award',     color: 'success', sortOrder: 80 },
  { key: 'graded-5',    title: 'Активный',        description: 'Получить оценку за 5 работ',  category: 'grades',      conditionField: 'gradedCount',    conditionValue: 5,  xpReward: 100,  iconKey: 'target',    color: 'indigo',  sortOrder: 90 },
];
