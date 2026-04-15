'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Check, Sparkles, Zap, Building2, Gift } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { useSubscription } from '@/lib/hooks/useSubscription'

declare global {
  interface Window {
    cp?: {
      CloudPayments: new () => {
        pay: (
          action: 'charge' | 'auth',
          params: Record<string, unknown>,
          callbacks: {
            onSuccess?: (options: unknown) => void
            onFail?: (reason: string, options: unknown) => void
            onComplete?: (paymentResult: unknown, options: unknown) => void
          },
        ) => void
      }
    }
  }
}

interface Plan {
  planKey: string
  planName: string
  monthlyCredits: number
  price: number
  allowOverage: boolean
  overageCostPerCredit: number | null
  features: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  highlightPlanKey?: string
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free:     <Gift className="w-5 h-5" />,
  starter:  <Zap className="w-5 h-5" />,
  pro:      <Sparkles className="w-5 h-5" />,
  business: <Building2 className="w-5 h-5" />,
}

const PLAN_COLORS: Record<string, { bg: string; border: string; badge: string; btn: string; icon: string }> = {
  free:     { bg: 'bg-gray-50',    border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-600',     btn: 'bg-gray-800 hover:bg-gray-700',          icon: 'bg-gray-100 text-gray-600' },
  starter:  { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',     btn: 'bg-blue-600 hover:bg-blue-500',           icon: 'bg-blue-100 text-blue-600' },
  pro:      { bg: 'bg-purple-50', border: 'border-purple-300', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-500',        icon: 'bg-purple-100 text-purple-600' },
  business: { bg: 'bg-amber-50',  border: 'border-amber-300',  badge: 'bg-amber-100 text-amber-700',   btn: 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400', icon: 'bg-amber-100 text-amber-600' },
}

const PLAN_ORDER = ['free', 'starter', 'pro', 'business']

// Детальное описание каждого тарифа с конкретными инструментами.
// Каждый тариф включает все инструменты тарифов ниже (накопительно).
const PLAN_DETAILS: Record<string, { tagline: string; inherits?: string; tools: { emoji: string; name: string; hint: string }[] }> = {
  free: {
    tagline: 'Базовые инструменты для подготовки уроков',
    tools: [
      { emoji: '📖', name: 'Конструктор Уроков', hint: 'Планы уроков с целями и таймингом' },
      { emoji: '✏️', name: 'Рабочие Листы', hint: 'Материалы для печати и ДЗ' },
      { emoji: '📚', name: 'Словарь', hint: 'Термины и определения по теме' },
      { emoji: '🔄', name: 'Адаптация Текста', hint: 'Упрощение или усложнение материала' },
      { emoji: '✅', name: 'Генератор Тестов', hint: 'Интерактивные тесты в один клик' },
      { emoji: '💬', name: 'Фидбек', hint: 'Обратная связь для учеников' },
      { emoji: '🤖', name: 'AI Ассистент', hint: '10 запросов в день' },
    ],
  },
  starter: {
    tagline: 'Все базовые + мощные инструменты для активного преподавания',
    inherits: 'Бесплатный',
    tools: [
      { emoji: '✨', name: 'Вау-урок', hint: 'Впечатляющий урок с интерактивными элементами' },
      { emoji: '🎮', name: 'Обучающие Игры', hint: 'Memory, флэш-карты, викторины' },
      { emoji: '🎓', name: 'Варианты ОГЭ/ЕГЭ', hint: 'По спецификациям ФИПИ' },
      { emoji: '📦', name: 'Распаковка Экспертности', hint: 'Структурирование знаний' },
      { emoji: '🎬', name: 'Анализ Видео', hint: 'Ключевые моменты из видеоурока' },
      { emoji: '🖥️', name: 'Презентации', hint: 'Слайды с экспортом в PDF/PPTX' },
      { emoji: '🎙️', name: 'Транскрибация', hint: 'Видео и лекции → текст' },
      { emoji: '🤖', name: 'AI Ассистент', hint: '50 запросов в день' },
    ],
  },
  pro: {
    tagline: 'Всё из Стартера + создание уникального визуального контента',
    inherits: 'Стартер',
    tools: [
      { emoji: '🖼️', name: 'Генератор Изображений', hint: 'Иллюстрации для учебных материалов' },
      { emoji: '📸', name: 'AI Фотосессия', hint: 'Серия фото в едином стиле' },
      { emoji: '🤖', name: 'AI Ассистент', hint: 'Безлимитные запросы' },
      { emoji: '🔄', name: 'Перенос токенов', hint: 'До 100 неиспользованных токенов' },
    ],
  },
  business: {
    tagline: 'Максимум возможностей: всё из Про + приоритет и овередж',
    inherits: 'Про',
    tools: [
      { emoji: '💰', name: 'Овередж токены', hint: '1.5₽ за токен при превышении лимита' },
      { emoji: '🏆', name: 'Перенос токенов', hint: 'До 300 неиспользованных токенов' },
      { emoji: '⚡', name: 'Приоритетная поддержка', hint: 'Ответ в течение 2 часов' },
      { emoji: '📊', name: '1500 токенов/месяц', hint: 'Максимальный объём генераций' },
    ],
  },
}

const CP_WIDGET_URL = 'https://widget.cloudpayments.ru/bundles/cloudpayments.js'

function useCloudPaymentsScript() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (window.cp) { setReady(true); return }
    if (document.querySelector(`script[src="${CP_WIDGET_URL}"]`)) return

    const script = document.createElement('script')
    script.src = CP_WIDGET_URL
    script.async = true
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [])

  return ready
}

export default function PlanUpgradeModal({ open, onClose, highlightPlanKey }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [payingPlanKey, setPayingPlanKey] = useState<string | null>(null)
  const [successPlanKey, setSuccessPlanKey] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [consentChecked, setConsentChecked] = useState(false)

  const { subscription, refetch } = useSubscription()
  const cpReady = useCloudPaymentsScript()

  const currentPlanKey = (subscription as any)?.planKey || 'free'

  useEffect(() => {
    if (!open) return
    setSuccessPlanKey(null)
    setErrorMsg(null)
    setConsentChecked(false)
    apiClient.get('/subscriptions/plans')
      .then(r => {
        const sorted = (r.data.plans as Plan[]).sort((a, b) => a.price - b.price)
        setPlans(sorted)
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleBuy = useCallback(async (plan: Plan) => {
    if (!cpReady || payingPlanKey) return
    setErrorMsg(null)
    setPayingPlanKey(plan.planKey)

    try {
      const { data } = await apiClient.post('/payments/create-order', { planKey: plan.planKey, consentGiven: true })

      const widget = new window.cp!.CloudPayments()

      widget.pay(
        'charge',
        {
          publicId: data.publicId,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          accountId: data.accountId,
          invoiceId: data.invoiceId,
          skin: 'mini',
          data: { planKey: plan.planKey },
          // Рекуррентные: CloudPayments создаст подписку автоматически
          // если в настройках терминала включён recurring
          recurring: {
            interval: 'Month',
            period: 1,
          },
        },
        {
          onSuccess: () => {
            setSuccessPlanKey(plan.planKey)
            setPayingPlanKey(null)
            // Обновляем данные подписки
            setTimeout(() => refetch(), 2000)
          },
          onFail: (reason) => {
            setErrorMsg(`Платёж отклонён: ${reason}`)
            setPayingPlanKey(null)
          },
          onComplete: () => {
            setPayingPlanKey(null)
          },
        },
      )
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || 'Ошибка при создании платежа')
      setPayingPlanKey(null)
    }
  }, [cpReady, payingPlanKey, refetch])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Выберите тариф</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Текущий тариф:{' '}
              <span className="font-semibold text-gray-700">
                {plans.find(p => p.planKey === currentPlanKey)?.planName || currentPlanKey}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Error banner */}
        {errorMsg && (
          <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Plans grid */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 p-5 animate-pulse bg-gray-50 h-72" />
            ))
          ) : plans.map((plan) => {
            const colors = PLAN_COLORS[plan.planKey] || PLAN_COLORS.starter
            const isCurrent = plan.planKey === currentPlanKey
            const isHighlighted = plan.planKey === highlightPlanKey
            const isPro = plan.planKey === 'pro'
            const isPaying = payingPlanKey === plan.planKey
            const isSuccess = successPlanKey === plan.planKey
            const currentIndex = PLAN_ORDER.indexOf(currentPlanKey)
            const planIndex = PLAN_ORDER.indexOf(plan.planKey)
            const isLowerPlan = !isCurrent && planIndex < currentIndex

            return (
              <div
                key={plan.planKey}
                className={`relative rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all ${colors.bg} ${
                  isCurrent ? 'border-gray-400 ring-2 ring-gray-300' :
                  isHighlighted ? `${colors.border} ring-2 ring-offset-1 ring-purple-400` :
                  colors.border
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-600 text-white text-xs font-bold rounded-full shadow">
                    Популярный
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gray-600 text-white text-xs font-bold rounded-full shadow">
                    Текущий
                  </div>
                )}

                {/* Icon + name */}
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.icon}`}>
                    {PLAN_ICONS[plan.planKey]}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 leading-tight">{plan.planName}</p>
                    <p className="text-xs text-gray-500">{plan.monthlyCredits} токенов/мес</p>
                  </div>
                </div>

                {/* Price */}
                <div>
                  {plan.price === 0 ? (
                    <span className="text-3xl font-black text-gray-900">Бесплатно</span>
                  ) : (
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-black text-gray-900">{plan.price}₽</span>
                      <span className="text-sm text-gray-500 mb-1">/мес</span>
                    </div>
                  )}
                </div>

                {/* Tagline */}
                {PLAN_DETAILS[plan.planKey] && (
                  <p className="text-[11px] text-gray-500 leading-relaxed -mt-1">
                    {PLAN_DETAILS[plan.planKey].tagline}
                  </p>
                )}

                {/* Detailed tools list */}
                <ul className="flex flex-col gap-2 flex-1">
                  {PLAN_DETAILS[plan.planKey]
                    ? <>
                        {PLAN_DETAILS[plan.planKey].inherits && (
                          <li className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-100 border border-gray-200 mb-1">
                            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            <span className="text-xs font-medium text-gray-600">
                              Все функции тарифа «{PLAN_DETAILS[plan.planKey].inherits}»
                            </span>
                          </li>
                        )}
                        {PLAN_DETAILS[plan.planKey].tools.map((tool, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-sm leading-none mt-0.5 flex-shrink-0">{tool.emoji}</span>
                            <div className="min-w-0">
                              <span className="text-xs font-semibold text-gray-800">{tool.name}</span>
                              <span className="text-[10px] text-gray-400 block leading-tight">{tool.hint}</span>
                            </div>
                          </li>
                        ))}
                      </>
                    : plan.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))
                  }
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-gray-200 text-gray-500 cursor-default">
                    Текущий тариф
                  </div>
                ) : isLowerPlan ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-gray-100 text-gray-400 cursor-default">
                    Включён в ваш тариф
                  </div>
                ) : plan.price === 0 ? null : isSuccess ? (
                  <div className="w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-green-100 text-green-700 flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    Оплачено!
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={consentChecked}
                        onChange={e => setConsentChecked(e.target.checked)}
                        className="mt-0.5 flex-shrink-0 accent-blue-600"
                      />
                      <span className="text-[10px] text-gray-500 leading-tight">
                        Я даю{' '}
                        <a
                          href="/legal/consent/recurrent"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline"
                          onClick={e => e.stopPropagation()}
                        >
                          Согласие
                        </a>{' '}
                        на автоматические ежемесячные списания. Могу отменить в любой момент.
                      </span>
                    </label>
                    <button
                      onClick={() => handleBuy(plan)}
                      disabled={!consentChecked || isPaying || !cpReady}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white text-center flex items-center justify-center gap-2 transition-all ${
                        consentChecked && !isPaying
                          ? `${colors.btn} cursor-pointer`
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {isPaying ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                          Обработка...
                        </span>
                      ) : (
                        `Оплатить ${plan.price}₽`
                      )}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="px-6 pb-5 text-xs text-center text-gray-400">
          Оплата через CloudPayments — защищена по стандарту PCI DSS.
          Токены начисляются сразу после оплаты. Остаток текущих токенов сохраняется.
        </p>
      </div>
    </div>
  )
}
