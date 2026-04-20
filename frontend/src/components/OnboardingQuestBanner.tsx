'use client'

import { useState } from 'react'
import { useOnboardingQuest } from '@/lib/hooks/useOnboardingQuest'

const STEP_ICONS: Record<string, string> = {
  FIRST_GENERATION: 'fas fa-magic',
  SECOND_TYPE_GENERATION: 'fas fa-layer-group',
  SHARED_REFERRAL_LINK: 'fas fa-share-alt',
  FIRST_REFERRAL_ACTIVATED: 'fas fa-user-plus',
  SECOND_REFERRAL_ACTIVATED: 'fas fa-users',
}

export default function OnboardingQuestBanner() {
  const { data: quest, isLoading } = useOnboardingQuest()
  const [isExpanded, setIsExpanded] = useState(true)

  if (isLoading || !quest) return null

  const progressPercent = Math.round((quest.completedCount / quest.totalSteps) * 100)
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(quest.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  )

  const totalPossibleReward = quest.steps.reduce((sum, s) => sum + s.reward, 0)
  const remainingReward = totalPossibleReward - quest.totalRewardEarned

  return (
    <div className="mb-6 bg-gradient-to-r from-primary-50 to-blue-50 border border-primary-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Заголовок баннера */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shrink-0">
            <i className="fas fa-trophy text-white text-sm" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm">Квест новичка</span>
              <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                +{remainingReward} можете получить
              </span>
              {daysLeft <= 3 && (
                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                  {daysLeft} {daysLeft === 1 ? 'день' : 'дня'} осталось
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 h-1.5 bg-primary-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">
                {quest.completedCount}/{quest.totalSteps}
              </span>
            </div>
          </div>
        </div>
        <i
          className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-gray-400 text-sm ml-2 shrink-0`}
        />
      </button>

      {/* Шаги */}
      {isExpanded && (
        <div className="px-5 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {quest.steps.map((step, index) => {
              const isNext = !step.completed && quest.steps.slice(0, index).every((s) => s.completed)
              return (
                <div
                  key={step.step}
                  className={`relative flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2 p-3 rounded-xl transition-all ${
                    step.completed
                      ? 'bg-white border border-green-200'
                      : isNext
                        ? 'bg-white border-2 border-primary-400 shadow-sm'
                        : 'bg-white/60 border border-gray-200 opacity-60'
                  }`}
                >
                  {/* Иконка */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      step.completed
                        ? 'bg-green-100'
                        : isNext
                          ? 'bg-primary-100'
                          : 'bg-gray-100'
                    }`}
                  >
                    {step.completed ? (
                      <i className="fas fa-check text-green-600 text-sm" />
                    ) : (
                      <i
                        className={`${STEP_ICONS[step.step] ?? 'fas fa-circle'} text-sm ${isNext ? 'text-primary-600' : 'text-gray-400'}`}
                      />
                    )}
                  </div>

                  {/* Текст */}
                  <div className="flex-1 sm:text-center min-w-0">
                    <p
                      className={`text-xs font-semibold leading-tight ${step.completed ? 'text-green-700' : isNext ? 'text-gray-900' : 'text-gray-400'}`}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 hidden sm:block leading-tight">
                      {step.completed ? step.description : `Получите +${step.reward} токенов`}
                    </p>
                  </div>

                  {/* Награда */}
                  <div
                    className={`text-xs font-bold shrink-0 ${step.completed ? 'text-green-600' : isNext ? 'text-primary-600' : 'text-gray-300'}`}
                  >
                    +{step.reward}
                  </div>

                  {/* Стрелка между шагами (только десктоп) */}
                  {index < quest.steps.length - 1 && (
                    <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 hidden sm:block z-10">
                      <i className="fas fa-chevron-right text-gray-300 text-xs" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Подсказка следующего шага */}
          {quest.nextStep && (
            <p className="mt-3 text-xs text-gray-500 text-center">
              <i className="fas fa-arrow-right mr-1 text-primary-400" />
              Следующий шаг:{' '}
              <span className="font-medium text-gray-700">{quest.nextStep.description}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
