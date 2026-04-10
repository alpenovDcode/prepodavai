-- ============================================================
-- Обновление тарифных планов и стоимости операций
-- ============================================================

-- 1. Добавить план "free" если не существует, иначе обновить
INSERT INTO subscription_plans ("planKey", "planName", "monthlyCredits", price, currency, "allowOverage", "overageCostPerCredit", features, "isActive", "createdAt", "updatedAt")
VALUES (
  'free', 'Бесплатный', 30, 0, 'RUB', false, NULL,
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
  features         = ARRAY['Всё из Про','Перерасход: 1.5р / токен','Перенос до 300 токенов на следующий месяц','Приоритетная поддержка'],
  "updatedAt"      = NOW()
WHERE "planKey" = 'business';

-- ============================================================
-- Стоимость операций (upsert)
-- ============================================================

INSERT INTO credit_costs ("operationType", "operationName", "creditCost", description, "isActive", "createdAt", "updatedAt")
VALUES
  ('text_generation',    'Генерация текста',           1,  'Себест. ~1р',     true, NOW(), NOW()),
  ('message',            'Сообщение родителям',        1,  'Себест. ~1р',     true, NOW(), NOW()),
  ('worksheet',          'Рабочий лист',               3,  'Себест. ~1.5р',   true, NOW(), NOW()),
  ('quiz',               'Тест',                        3,  'Себест. ~1.5р',   true, NOW(), NOW()),
  ('vocabulary',         'Словарь',                    3,  'Себест. ~1.5р',   true, NOW(), NOW()),
  ('lesson_plan',        'План урока',                 3,  'Себест. ~1.5р',   true, NOW(), NOW()),
  ('feedback',           'Проверка ДЗ',               3,  'Себест. ~1.5р',   true, NOW(), NOW()),
  ('content_adaptation', 'Адаптация текста',           3,  'Себест. ~1.5–3р', true, NOW(), NOW()),
  ('game_generation',    'Игра',                        15, 'Себест. ~1.5р',   true, NOW(), NOW()),
  ('exam_variant',       'Вариант ОГЭ/ЕГЭ',            20, 'Себест. ~1.5р',   true, NOW(), NOW()),
  ('expert_unpacking',   'Распаковка экспертности',    20, 'Себест. ~2р',     true, NOW(), NOW()),
  ('video_analysis',     'Анализ видео',               15, 'Себест. ~5р',     true, NOW(), NOW()),
  ('transcription',      'Транскрибация видео',        15, 'Себест. ~5р',     true, NOW(), NOW()),
  ('presentation',       'Презентация',                50, 'Себест. ~3–15р',  true, NOW(), NOW()),
  ('image_generation',   'ИИ Генератор фото',          15, 'Себест. ~12р',    true, NOW(), NOW()),
  ('photosession',       'ИИ Фотосессия',             25, 'Себест. ~18р',    true, NOW(), NOW())
ON CONFLICT ("operationType") DO UPDATE SET
  "operationName" = EXCLUDED."operationName",
  "creditCost"    = EXCLUDED."creditCost",
  description     = EXCLUDED.description,
  "updatedAt"     = NOW();
