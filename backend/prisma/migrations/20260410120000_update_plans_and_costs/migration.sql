-- ============================================================
-- Обновление тарифных планов и стоимости операций
-- ============================================================

-- 1. Добавить план "free" если не существует, иначе обновить
INSERT INTO subscription_plans (id, "planKey", "planName", "monthlyCredits", price, currency, "allowOverage", "overageCostPerCredit", features, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(), 'free', 'Бесплатный', 30, 0, 'RUB', false, NULL,
  ARRAY['Рабочий лист, тест, словарь','Адаптация текста, план урока','ИИ ассистент (10 запросов/день)','История генераций'],
  true, NOW(), NOW()
)
ON CONFLICT ("planKey") DO UPDATE SET
  "planName"       = 'Бесплатный',
  "monthlyCredits" = 30,
  price            = 0,
  "allowOverage"   = false,
  "overageCostPerCredit" = NULL,
  features         = ARRAY['Рабочий лист, тест, словарь','Адаптация текста, план урока','ИИ ассистент (10 запросов/день)','История генераций'],
  "updatedAt"      = NOW();

-- 2. Обновить Стартер (бывший бесплатный, теперь 290р / 200 токенов)
UPDATE subscription_plans SET
  "planName"       = 'Стартер',
  "monthlyCredits" = 200,
  price            = 290,
  "allowOverage"   = false,
  "overageCostPerCredit" = NULL,
  features         = ARRAY['Рабочий лист, тест, словарь','Адаптация текста, план урока','Игры, ОГЭ/ЕГЭ, Распаковка экспертности','Анализ видео, Презентации','ИИ ассистент (50 запросов/день)'],
  "updatedAt"      = NOW()
WHERE "planKey" = 'starter';

-- 3. Обновить Про (690р / 500 токенов)
UPDATE subscription_plans SET
  "planName"       = 'Про',
  "monthlyCredits" = 500,
  price            = 690,
  "allowOverage"   = false,
  "overageCostPerCredit" = NULL,
  features         = ARRAY['Всё из Стартера','ИИ Генератор фото','ИИ Фотосессия','ИИ ассистент (безлимит)','Перенос до 100 токенов на следующий месяц'],
  "updatedAt"      = NOW()
WHERE "planKey" = 'pro';

-- 4. Обновить Бизнес (1490р / 1500 токенов)
UPDATE subscription_plans SET
  "planName"       = 'Бизнес',
  "monthlyCredits" = 1500,
  price            = 1490,
  "allowOverage"   = true,
  "overageCostPerCredit" = 1.5,
  features         = ARRAY['Всё из Про','Перенос до 300 токенов на следующий месяц','Приоритетная поддержка'],
  "updatedAt"      = NOW()
WHERE "planKey" = 'business';

-- ============================================================
-- Стоимость операций (upsert)
-- ============================================================

INSERT INTO credit_costs (id, "operationType", "operationName", "creditCost", description, "isActive", "isUnderMaintenance", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'text_generation',    'Генерация текста',           1,  'Себест. ~1р',     true, false, NOW(), NOW()),
  (gen_random_uuid(), 'message',            'Сообщение родителям',        1,  'Себест. ~1р',     true, false, NOW(), NOW()),
  (gen_random_uuid(), 'worksheet',          'Рабочий лист',               3,  'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'quiz',               'Тест',                        3,  'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'vocabulary',         'Словарь',                    3,  'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'lesson_plan',        'План урока',                 3,  'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'feedback',           'Проверка ДЗ',               3,  'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'content_adaptation', 'Адаптация текста',           3,  'Себест. ~1.5–3р', true, false, NOW(), NOW()),
  (gen_random_uuid(), 'game_generation',    'Игра',                        15, 'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'exam_variant',       'Вариант ОГЭ/ЕГЭ',            20, 'Себест. ~1.5р',   true, false, NOW(), NOW()),
  (gen_random_uuid(), 'expert_unpacking',   'Распаковка экспертности',    20, 'Себест. ~2р',     true, false, NOW(), NOW()),
  (gen_random_uuid(), 'video_analysis',     'Анализ видео',               15, 'Себест. ~5р',     true, false, NOW(), NOW()),
  (gen_random_uuid(), 'transcription',      'Транскрибация видео',        15, 'Себест. ~5р',     true, false, NOW(), NOW()),
  (gen_random_uuid(), 'presentation',       'Презентация',                50, 'Себест. ~3–15р',  true, false, NOW(), NOW()),
  (gen_random_uuid(), 'image_generation',   'ИИ Генератор фото',          15, 'Себест. ~12р',    true, false, NOW(), NOW()),
  (gen_random_uuid(), 'photosession',       'ИИ Фотосессия',             25, 'Себест. ~18р',    true, false, NOW(), NOW())
ON CONFLICT ("operationType") DO UPDATE SET
  "operationName"      = EXCLUDED."operationName",
  "creditCost"         = EXCLUDED."creditCost",
  description          = EXCLUDED.description,
  "updatedAt"          = NOW();
