'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { apiClient } from '@/lib/api/client'
import { AlertTriangle, CheckCircle, Info, RefreshCw, TrendingDown, Users, Zap } from 'lucide-react'

const fetcher = (url: string) => apiClient.get(url).then(r => r.data)

const SEVERITY_CONFIG = {
  critical: { color: 'red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-700', icon: AlertTriangle },
  warning:  { color: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
  info:     { color: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', icon: Info },
}

const TYPE_ICON: Record<string, any> = {
  registration_drop: TrendingDown,
  heavy_token_user: Users,
  high_error_rate: Zap,
}

function AlertCard({ alert }: { alert: any }) {
  const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
  const SeverityIcon = cfg.icon
  const TypeIcon = TYPE_ICON[alert.type] ?? AlertTriangle

  return (
    <div className={`rounded-2xl border p-5 flex gap-4 ${cfg.bg} ${cfg.border}`}>
      <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${cfg.badge}`}>
        <TypeIcon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`font-semibold text-sm ${cfg.text}`}>{alert.message}</p>
            {alert.detail && (
              <p className="text-xs text-gray-500 mt-0.5">{alert.detail}</p>
            )}
          </div>
          <span className={`flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
            {alert.severity === 'critical' ? 'Критично' : alert.severity === 'warning' ? 'Внимание' : 'Инфо'}
          </span>
        </div>
        {alert.value !== undefined && (
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-lg font-bold ${cfg.text}`}>{typeof alert.value === 'number' ? alert.value.toLocaleString() : alert.value}</span>
            {alert.threshold !== undefined && (
              <span className="text-xs text-gray-400">порог: {alert.threshold}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AlertsPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, isLoading, mutate } = useSWR(
    ['/admin/product/alerts', refreshKey],
    ([url]) => fetcher(url),
    { refreshInterval: 60_000 }
  )

  const alerts: any[] = data?.alerts ?? []
  const criticals = alerts.filter(a => a.severity === 'critical')
  const warnings  = alerts.filter(a => a.severity === 'warning')
  const infos     = alerts.filter(a => a.severity === 'info')

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Алерты</h1>
          <p className="text-gray-500">Автоматические сигналы об аномалиях платформы</p>
        </div>
        <button
          onClick={() => { setRefreshKey(k => k + 1); mutate() }}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 shadow-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Обновить
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{criticals.length}</div>
            <div className="text-xs text-gray-500">Критичных</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{warnings.length}</div>
            <div className="text-xs text-gray-500">Предупреждений</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Info className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{infos.length}</div>
            <div className="text-xs text-gray-500">Информационных</div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">Всё в норме</p>
          <p className="text-sm text-gray-400 mt-1">Аномалий не обнаружено. Обновляется каждую минуту.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {criticals.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3">Критичные</h2>
              <div className="space-y-3">
                {criticals.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3">Предупреждения</h2>
              <div className="space-y-3">
                {warnings.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            </div>
          )}
          {infos.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3">Информация</h2>
              <div className="space-y-3">
                {infos.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">Автообновление каждые 60 секунд</p>
    </div>
  )
}
