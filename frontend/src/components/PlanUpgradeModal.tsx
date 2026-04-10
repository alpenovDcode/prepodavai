'use client'

import { useState, useEffect } from 'react'
import { X, Check, Sparkles, Zap, Building2, Gift } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { useSubscription } from '@/lib/hooks/useSubscription'

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
  highlightPlanKey?: string // открыть с выделенным тарифом (например после блокировки)
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

export default function PlanUpgradeModal({ open, onClose, highlightPlanKey }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { subscription, refetch } = useSubscription()

  const currentPlanKey = (subscription as any)?.planKey || 'free'
  const currentIdx = PLAN_ORDER.indexOf(currentPlanKey)

  useEffect(() => {
    if (!open) return
    apiClient.get('/subscriptions/plans')
      .then(r => {
        // sort by price
        const sorted = (r.data.plans as Plan[]).sort((a, b) => a.price - b.price)
        setPlans(sorted)
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleUpgrade = async (planKey: string) => {
    setUpgrading(planKey)
    setError(null)
    try {
      const res = await apiClient.post('/subscriptions/upgrade', { planKey })
      setSuccess(res.data.message)
      await refetch()
      setTimeout(() => { setSuccess(null); onClose() }, 2500)
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Ошибка при смене тарифа')
    } finally {
      setUpgrading(null)
    }
  }

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
              Текущий тариф: <span className="font-semibold text-gray-700">
                {plans.find(p => p.planKey === currentPlanKey)?.planName || currentPlanKey}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Success */}
        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 font-medium text-sm flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" /> {success}
          </div>
        )}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
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
            const planIdx = PLAN_ORDER.indexOf(plan.planKey)
            const isCurrent = plan.planKey === currentPlanKey
            const isDowngrade = planIdx < currentIdx
            const isHighlighted = plan.planKey === highlightPlanKey
            const isPro = plan.planKey === 'pro'

            return (
              <div
                key={plan.planKey}
                className={`relative rounded-2xl border-2 p-5 flex flex-col gap-4 transition-all ${colors.bg} ${
                  isCurrent ? 'border-gray-400 ring-2 ring-gray-300' :
                  isHighlighted ? `${colors.border} ring-2 ring-offset-1 ring-purple-400` :
                  colors.border
                }`}
              >
                {/* Popular badge */}
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
                  {plan.allowOverage && plan.overageCostPerCredit && (
                    <p className="text-xs text-gray-400 mt-0.5">Перерасход: {plan.overageCostPerCredit}₽/токен</p>
                  )}
                </div>

                {/* Features */}
                <ul className="flex flex-col gap-1.5 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => !isCurrent && !isDowngrade && handleUpgrade(plan.planKey)}
                  disabled={isCurrent || isDowngrade || upgrading === plan.planKey}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all ${
                    isCurrent
                      ? 'bg-gray-300 cursor-default'
                      : isDowngrade
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : `${colors.btn} active:scale-[0.98]`
                  }`}
                >
                  {upgrading === plan.planKey ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Активация...
                    </span>
                  ) : isCurrent ? 'Текущий тариф' : isDowngrade ? 'Недоступно' : plan.price === 0 ? 'Выбрать' : 'Подключить'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="px-6 pb-5 text-xs text-center text-gray-400">
          Токены начисляются сразу после активации. Остаток текущих токенов сохраняется.
          {' '}При вопросах — напишите в поддержку.
        </p>
      </div>
    </div>
  )
}
