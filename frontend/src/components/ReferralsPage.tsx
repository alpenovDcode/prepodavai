'use client'

import { useState } from 'react'
import { useReferralCode, useReferralStats, useReferralsList, useCreateReferralCode } from '@/lib/hooks/useReferrals'
import {
  Loader2, Copy, Check, Gift, Users, TrendingUp, Award,
  UserPlus, CreditCard, Clock, CheckCircle, AlertCircle
} from 'lucide-react'

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  registered: { label: 'Зарегистрирован', color: 'text-gray-500 bg-gray-50', icon: Clock },
  activated: { label: 'Активирован', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  converted: { label: 'Оплатил подписку', color: 'text-purple-600 bg-purple-50', icon: CreditCard },
}

const REFERRAL_TYPE_MAP: Record<string, string> = {
  teacher_teacher: 'Учитель',
  teacher_student: 'Ученик',
  student_student: 'Ученик',
}

const MILESTONE_LABELS: Record<string, string> = {
  students_5: '5 активных учеников',
  students_10: '10 активных учеников',
  teachers_3: '3 приглашённых учителя',
  teachers_8: '8 приглашённых учителей',
}

export default function ReferralsPage() {
  const { data: referralCode, isLoading: codeLoading } = useReferralCode()
  const { data: stats, isLoading: statsLoading } = useReferralStats()
  const { data: referrals, isLoading: listLoading } = useReferralsList()
  const createCode = useCreateReferralCode()

  const [customCode, setCustomCode] = useState('')
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateCode = async (custom?: string) => {
    setError(null)
    try {
      await createCode.mutateAsync(custom)
      setShowCustomInput(false)
      setCustomCode('')
    } catch (e: any) {
      setError(e.response?.data?.message || 'Ошибка при создании кода')
    }
  }

  const copyToClipboard = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text)
    setCopied(type)
    setTimeout(() => setCopied(null), 2000)
  }

  const isLoading = codeLoading || statsLoading

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Пригласительная ссылка</h1>
        <p className="text-gray-600 mt-1">Приглашайте коллег — получайте бонусные Токены.</p>
      </div>

      {/* Referral Code Section */}
      <div className="dashboard-card mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary-600" />
          Ваша пригласительная ссылка
        </h2>

        {referralCode ? (
          <div className="space-y-4">
            {/* Code display */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-primary-50 border border-primary-100 rounded-xl">
                <span className="text-2xl font-black text-primary-700 tracking-wider">{referralCode.code}</span>
                <button
                  onClick={() => copyToClipboard(referralCode.code, 'code')}
                  className="ml-auto p-2 hover:bg-primary-100 rounded-lg transition"
                  title="Скопировать код"
                >
                  {copied === 'code' ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5 text-primary-600" />
                  )}
                </button>
              </div>
              <button
                onClick={() => copyToClipboard(referralCode.link, 'link')}
                className="px-5 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 justify-center whitespace-nowrap"
              >
                {copied === 'link' ? (
                  <>
                    <Check className="w-4 h-4" />
                    Скопировано!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Копировать ссылку
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-500">
              Использований: <span className="font-semibold text-gray-700">{referralCode.usageCount}</span>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-gray-600">У вас ещё нет пригласительной ссылки. Создайте её, чтобы начать приглашать.</p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleCreateCode()}
                disabled={createCode.isPending}
                className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition flex items-center gap-2 disabled:opacity-50"
              >
                {createCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                Сгенерировать код
              </button>
              <button
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition"
              >
                Свой код
              </button>
            </div>

            {showCustomInput && (
              <div className="flex gap-3">
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="MYCODE2024"
                  maxLength={16}
                  className="flex-1 px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition font-mono uppercase"
                />
                <button
                  onClick={() => handleCreateCode(customCode)}
                  disabled={customCode.length < 4 || createCode.isPending}
                  className="px-5 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition disabled:opacity-50"
                >
                  Создать
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="dashboard-card !p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{stats.totalReferrals}</p>
            <p className="text-xs text-gray-500 font-medium">Всего приглашённых</p>
          </div>

          <div className="dashboard-card !p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{stats.activated}</p>
            <p className="text-xs text-gray-500 font-medium">Активированы</p>
          </div>

          <div className="dashboard-card !p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-purple-50 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{stats.converted}</p>
            <p className="text-xs text-gray-500 font-medium">Оплатили</p>
          </div>

          <div className="dashboard-card !p-4 text-center">
            <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-amber-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-gray-900">{stats.creditsEarned}</p>
            <p className="text-xs text-gray-500 font-medium">Заработано Токенов</p>
          </div>
        </div>
      )}

      {/* Reward Tiers */}
      <div className="dashboard-card mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-600" />
          Шкала наград
        </h2>

        <div className="space-y-3">
          {[
            { range: '1-3 приглашённых', reward: 50, min: 0, max: 3 },
            { range: '4-7 приглашённых', reward: 75, min: 4, max: 7 },
            { range: '8+ приглашённых', reward: 100, min: 8, max: Infinity },
          ].map((tier) => {
            const currentCount = stats?.currentTier.activatedTeachers || 0
            const isActive = currentCount >= tier.min && currentCount <= tier.max
            return (
              <div
                key={tier.range}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition ${isActive
                  ? 'bg-primary-50 border-primary-200 shadow-sm'
                  : 'bg-gray-50 border-gray-100'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <UserPlus className={`w-4 h-4 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                  <span className={`text-sm font-medium ${isActive ? 'text-primary-700' : 'text-gray-600'}`}>
                    {tier.range}
                  </span>
                  {isActive && (
                    <span className="text-[10px] font-bold bg-primary-600 text-white px-2 py-0.5 rounded-full">
                      ТЕКУЩИЙ
                    </span>
                  )}
                </div>
                <span className={`text-sm font-bold ${isActive ? 'text-primary-700' : 'text-gray-500'}`}>
                  +{tier.reward} Токенов за каждого
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-sm text-blue-700">
            <strong>+{CONVERSION_REWARD} Токенов</strong> дополнительно, когда приглашённый учитель оплачивает подписку Pro или Business.
          </p>
        </div>
      </div>

      {/* Milestones */}
      {stats && stats.milestones.length > 0 && (
        <div className="dashboard-card mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-primary-600" />
            Достижения
          </h2>

          <div className="space-y-3">
            {stats.milestones.map((m) => (
              <div
                key={m.milestone}
                className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-100 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <Award className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700">
                    {MILESTONE_LABELS[m.milestone] || m.milestone}
                  </span>
                </div>
                <span className="text-sm font-bold text-green-700">+{m.reward} Токенов</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="dashboard-card mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Как это работает</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-xl text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
              1
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Поделитесь кодом</h3>
            <p className="text-sm text-gray-500">Отправьте ссылку или код коллегам</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
              2
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Коллега регистрируется</h3>
            <p className="text-sm text-gray-500">Создает от 3-х генераций</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
              3
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Оба получают бонус</h3>
            <p className="text-sm text-gray-500">Токены начисляются автоматически</p>
          </div>
        </div>
      </div>

      {/* Referrals List */}
      <div className="dashboard-card">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-600" />
          Мои пригласительные
        </h2>

        {listLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : !referrals || referrals.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Пока нет приглашённых</p>
            <p className="text-sm text-gray-400 mt-1">Поделитесь своей ссылкой, чтобы начать приглашать</p>
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map((ref) => {
              const statusInfo = STATUS_MAP[ref.status] || STATUS_MAP.registered
              const StatusIcon = statusInfo.icon
              return (
                <div
                  key={ref.id}
                  className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                      {ref.referredName[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{ref.referredName}</p>
                      <p className="text-xs text-gray-400">
                        {REFERRAL_TYPE_MAP[ref.referralType] || ref.referralType}
                        {' \u00B7 '}
                        {new Date(ref.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const CONVERSION_REWARD = 200
