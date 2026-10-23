/**
 * Дефолтные воронки. Засеваются один раз через FunnelsSeedService.onModuleInit.
 * Соответствуют скрину 1 (две воронки: ВЕБ и ИИ-бот).
 */
export const FUNNEL_SEED = [
  {
    name: 'Веб-воронка',
    description: 'Блогер (инст) → веб → регистрация → первая генерация → ТГ',
    steps: [
      { order: 0, label: 'Показ страницы',          eventType: 'page_view',           isCohortAnchor: true },
      { order: 1, label: 'Клик по CTA',             eventType: 'click',               eventFilters: { eventName: 'cta_register' } },
      { order: 2, label: 'Просмотр онбординга',     eventType: 'onboarding_view' },
      { order: 3, label: 'Регистрация',             eventType: 'user_registered' },
      { order: 4, label: 'Первая генерация',        eventType: 'generation_created:nth=1' },
      { order: 5, label: 'Третья генерация',        eventType: 'generation_created:nth=3' },
      { order: 6, label: 'Десятая генерация',       eventType: 'generation_created:nth=10' },
      { order: 7, label: 'Привязка ТГ',             eventType: 'tg_linked' },
    ],
  },
  {
    name: 'ИИ-бот воронка',
    description: 'Pinterest/TikTok/Shorts → клик → подписка на канал → онбординг → генерация → веб',
    steps: [
      { order: 0, label: 'Показ страницы блогера',  eventType: 'page_view',           eventFilters: { utmMedium: 'bot_landing' }, isCohortAnchor: true },
      { order: 1, label: 'Клик по ссылке бота',     eventType: 'click',               eventFilters: { eventName: 'bot_link' } },
      { order: 2, label: 'Подписка на канал',       eventType: 'channel_subscribed' },
      { order: 3, label: 'Просмотр онбординга',     eventType: 'onboarding_view' },
      { order: 4, label: 'Первая генерация',        eventType: 'generation_created:nth=1' },
      { order: 5, label: 'Третья генерация',        eventType: 'generation_created:nth=3' },
      { order: 6, label: 'Десятая генерация',       eventType: 'generation_created:nth=10' },
      { order: 7, label: 'Регистрация на вебе',     eventType: 'user_registered' },
    ],
  },
] as const;
