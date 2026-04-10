export enum OnboardingStep {
  FIRST_GENERATION = 'FIRST_GENERATION',
  SECOND_TYPE_GENERATION = 'SECOND_TYPE_GENERATION',
  SHARED_REFERRAL_LINK = 'SHARED_REFERRAL_LINK',
  FIRST_REFERRAL_ACTIVATED = 'FIRST_REFERRAL_ACTIVATED',
  SECOND_REFERRAL_ACTIVATED = 'SECOND_REFERRAL_ACTIVATED',
}

export const QUEST_STEPS_ORDER: OnboardingStep[] = [
  OnboardingStep.FIRST_GENERATION,
  OnboardingStep.SECOND_TYPE_GENERATION,
  OnboardingStep.SHARED_REFERRAL_LINK,
  OnboardingStep.FIRST_REFERRAL_ACTIVATED,
  OnboardingStep.SECOND_REFERRAL_ACTIVATED,
];

export interface StepMeta {
  step: OnboardingStep;
  reward: number;
  title: string;
  description: string;
}

export const STEP_META: Record<OnboardingStep, StepMeta> = {
  [OnboardingStep.FIRST_GENERATION]: {
    step: OnboardingStep.FIRST_GENERATION,
    reward: 10,
    title: 'Первый материал',
    description: 'Создайте любой учебный материал',
  },
  [OnboardingStep.SECOND_TYPE_GENERATION]: {
    step: OnboardingStep.SECOND_TYPE_GENERATION,
    reward: 15,
    title: 'Методист',
    description: 'Создайте материал другого типа',
  },
  [OnboardingStep.SHARED_REFERRAL_LINK]: {
    step: OnboardingStep.SHARED_REFERRAL_LINK,
    reward: 5,
    title: 'Поделитесь ссылкой',
    description: 'Получите реферальную ссылку',
  },
  [OnboardingStep.FIRST_REFERRAL_ACTIVATED]: {
    step: OnboardingStep.FIRST_REFERRAL_ACTIVATED,
    reward: 30,
    title: 'Первый коллега',
    description: 'Коллега зарегистрировался и создал материал',
  },
  [OnboardingStep.SECOND_REFERRAL_ACTIVATED]: {
    step: OnboardingStep.SECOND_REFERRAL_ACTIVATED,
    reward: 50,
    title: 'Методическое объединение',
    description: 'Второй коллега активировался',
  },
};

// Итого максимум за квест: 10 + 15 + 5 + 30 + 50 = 110 токенов
// ~55% от Стартера (200 токенов) — хороший буст без замены платного тарифа

// Квест активен 14 дней с момента регистрации
export const QUEST_DURATION_DAYS = 14;
