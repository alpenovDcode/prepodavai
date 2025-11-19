'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'

interface Stats {
  users: { total: number; active: number }
  generations: { total: number; completed: number; pending: number }
  subscriptions: { total: number; active: number }
  credits: { total: number }
  transactions: { total: number }
}

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'stats' | 'users' | 'generations' | 'subscriptions' | 'transactions'>('stats')
  const [stats, setStats] = useState<Stats | null>(null)
  const [data, setData] = useState<any[]>([])
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<any>({})
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: '', apiKey: '' })
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    // Проверяем авторизацию
    const token = localStorage.getItem('prepodavai_token')
    if (token) {
      setIsAuthenticated(true)
      loadStats()
      if (activeTab !== 'stats') {
        loadData()
      } else {
        setLoading(false)
      }
    } else {
      setIsAuthenticated(false)
      setLoading(false)
    }
  }, [activeTab, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setError(null)

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const response = await apiClient.post('/auth/login-with-api-key', {
        username: loginForm.username,
        apiKey: loginForm.apiKey,
      }, {
        timeout: 10000, // 10 секунд таймаут
      })

      if (response.data.success && response.data.token) {
        localStorage.setItem('prepodavai_token', response.data.token)
        localStorage.setItem('prepodavai_authenticated', 'true')
        setIsAuthenticated(true)
        setLoading(true)
        loadStats()
      } else {
        setError('Ошибка авторизации')
      }
    } catch (error: any) {
      console.error('Login error:', error)
      
      let errorMessage = 'Ошибка входа'
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        errorMessage = `Ошибка сети. Проверьте, что backend запущен на ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}. Убедитесь, что backend контейнер работает.`
      } else if (error.response?.status === 401) {
        errorMessage = error.response?.data?.message || 'Неверный username или API key'
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.message) {
        errorMessage = error.message
      }
      
      setError(errorMessage)
    } finally {
      setLoginLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      setError(null)
      setLoading(true)
      const response = await apiClient.get('/admin/stats')
      if (response.data.success) {
        setStats(response.data.stats)
      } else {
        setError('Не удалось загрузить статистику')
      }
    } catch (error: any) {
      console.error('Failed to load stats:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка загрузки статистики'
      setError(errorMessage)
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('prepodavai_token')
        localStorage.removeItem('prepodavai_authenticated')
        setIsAuthenticated(false)
        setError('Требуется авторизация. Пожалуйста, войдите в систему.')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      let endpoint = ''
      switch (activeTab) {
        case 'users':
          endpoint = '/admin/users'
          break
        case 'generations':
          endpoint = '/admin/generations'
          break
        case 'subscriptions':
          endpoint = '/admin/subscriptions'
          break
        case 'transactions':
          endpoint = '/admin/transactions'
          break
        default:
          setLoading(false)
          return
      }

      if (endpoint) {
        const response = await apiClient.get(endpoint)
        if (response.data.success) {
          const key = activeTab === 'users' ? 'users' : 
                     activeTab === 'generations' ? 'generations' :
                     activeTab === 'subscriptions' ? 'subscriptions' : 'transactions'
          const items = response.data[key] || []
          setData(items)
          console.log(`✅ Loaded ${items.length} items for ${activeTab}`)
        } else {
          setError('Не удалось загрузить данные')
        }
      }
    } catch (error: any) {
      console.error('Failed to load data:', error)
      const errorMessage = error.response?.data?.message || error.message || 'Ошибка загрузки данных'
      setError(errorMessage)
      
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('prepodavai_token')
        localStorage.removeItem('prepodavai_authenticated')
        setIsAuthenticated(false)
        setError('Требуется авторизация. Пожалуйста, войдите в систему.')
      }
      
      setData([])
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (item: any) => {
    setSelectedItem(item)
    setEditData({ ...item })
    setEditing(true)
  }

  const handleSave = async () => {
    if (!selectedItem) return

    try {
      // Удаляем поля, которые нельзя редактировать
      const { id, createdAt, updatedAt, user, plan, subscription, ...dataToSave } = editData
      
      // Для subscriptions нужно сохранить userId и planId как строки
      if (activeTab === 'subscriptions') {
        if (dataToSave.userId && typeof dataToSave.userId === 'object') {
          dataToSave.userId = dataToSave.userId.id || dataToSave.userId
        }
        if (dataToSave.planId && typeof dataToSave.planId === 'object') {
          dataToSave.planId = dataToSave.planId.id || dataToSave.planId
        }
      }

      // Для users исключаем связанные объекты
      if (activeTab === 'users') {
        delete dataToSave.subscription
        delete dataToSave.generations
        delete dataToSave.creditTransactions
        delete dataToSave.systemLogs
      }

      const endpoint = `/admin/${activeTab}/${selectedItem.id}`
      console.log('💾 Saving:', { endpoint, dataToSave })
      
      // Проверяем доступность backend
      const token = localStorage.getItem('prepodavai_token')
      if (!token) {
        throw new Error('Требуется авторизация. Пожалуйста, войдите в систему.')
      }

      const response = await apiClient.put(endpoint, dataToSave, {
        timeout: 10000, // 10 секунд таймаут
      })
      
      if (response.data.success) {
        alert('Данные успешно сохранены!')
        setEditing(false)
        setSelectedItem(null)
        loadData()
        loadStats()
      } else {
        throw new Error(response.data.error || 'Ошибка при сохранении')
      }
    } catch (error: any) {
      console.error('❌ Save error:', error)
      
      // Более детальная обработка ошибок
      let errorMessage = 'Ошибка при сохранении'
      
      if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
        errorMessage = 'Ошибка сети. Проверьте, что backend запущен на http://localhost:3001'
      } else if (error.response?.status === 401) {
        errorMessage = 'Требуется авторизация. Пожалуйста, войдите в систему.'
      } else if (error.response?.status === 403) {
        errorMessage = 'Доступ запрещен'
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error
      } else if (error.message) {
        errorMessage = error.message
      }
      
      alert(`Ошибка при сохранении: ${errorMessage}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту запись?')) return

    try {
      const endpoint = `/admin/${activeTab}/${id}`
      await apiClient.delete(endpoint)
      loadData()
      loadStats()
    } catch (error: any) {
      alert(error.response?.data?.error || 'Ошибка при удалении')
    }
  }

  const renderField = (key: string, value: any, editable: boolean = true) => {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      const formattedValue = key.includes('At') && value 
        ? new Date(value).toLocaleString('ru-RU')
        : String(value)
      return (
        <div key={key} className="grid grid-cols-2 gap-2 py-2 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">{key}:</span>
          <span className="text-sm text-gray-900">{formattedValue}</span>
        </div>
      )
    }

    if (typeof value === 'object' && value !== null) {
      return (
        <div key={key} className="py-2 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700 block mb-1">{key}:</span>
          {editing && editable ? (
            <textarea
              value={JSON.stringify(editData[key] || value, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value)
                  setEditData({ ...editData, [key]: parsed })
                } catch {
                  // Оставляем как строку если не валидный JSON
                  setEditData({ ...editData, [key]: e.target.value })
                }
              }}
              className="w-full text-xs bg-gray-50 p-2 rounded border border-gray-300 font-mono min-h-32 text-gray-900"
            />
          ) : (
            <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto max-h-32 text-gray-900 border border-gray-200">
              {JSON.stringify(value, null, 2)}
            </pre>
          )}
        </div>
      )
    }

    // Определяем тип поля для правильного input
    const isBoolean = typeof value === 'boolean'
    const isNumber = typeof value === 'number'
    const isDate = key.includes('Date') || key.includes('At')

    return (
      <div key={key} className="grid grid-cols-2 gap-2 py-2 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-700">{key}:</span>
        {editing && editable ? (
          <div>
            {isBoolean ? (
              <select
                value={String(editData[key] ?? value ?? false)}
                onChange={(e) => setEditData({ ...editData, [key]: e.target.value === 'true' })}
                className="text-sm border border-gray-300 rounded px-2 py-1 w-full text-gray-900 bg-white"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : isNumber ? (
              <input
                type="number"
                value={editData[key] ?? value ?? 0}
                onChange={(e) => setEditData({ ...editData, [key]: parseFloat(e.target.value) || 0 })}
                className="text-sm border border-gray-300 rounded px-2 py-1 w-full text-gray-900 bg-white"
              />
            ) : isDate ? (
              <input
                type="datetime-local"
                value={editData[key] ? new Date(editData[key]).toISOString().slice(0, 16) : ''}
                onChange={(e) => setEditData({ ...editData, [key]: new Date(e.target.value).toISOString() })}
                className="text-sm border border-gray-300 rounded px-2 py-1 w-full text-gray-900 bg-white"
              />
            ) : (
              <input
                type="text"
                value={editData[key] ?? value ?? ''}
                onChange={(e) => setEditData({ ...editData, [key]: e.target.value })}
                className="text-sm border border-gray-300 rounded px-2 py-1 w-full text-gray-900 bg-white"
              />
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-900">
            {isDate && value ? new Date(value).toLocaleString('ru-RU') : String(value ?? 'null')}
          </span>
        )}
      </div>
    )
  }

  // Форма входа
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Админ-панель</h1>
          <p className="text-sm text-gray-600 mb-6">Войдите для доступа к панели управления</p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="test_user"
                required
              />
            </div>
            
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                id="apiKey"
                type="password"
                value={loginForm.apiKey}
                onChange={(e) => setLoginForm({ ...loginForm, apiKey: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                placeholder="Введите ваш API ключ"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loginLoading ? 'Вход...' : 'Войти'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-600 mb-2">Данные для входа:</p>
            <p className="text-xs font-mono text-gray-800">Username: <span className="font-semibold">prepodavai_esvasileva</span></p>
            <p className="text-xs font-mono text-gray-800">API Key: <span className="font-semibold">stA-ud3-sKv-4gT</span></p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Админ-панель</h1>
            <p className="text-sm text-gray-600">Управление данными БД</p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('prepodavai_token')
              localStorage.removeItem('prepodavai_authenticated')
              setIsAuthenticated(false)
            }}
            className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="flex border-b">
            {(['stats', 'users', 'generations', 'subscriptions', 'transactions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab === 'stats' ? 'Статистика' :
                 tab === 'users' ? 'Пользователи' :
                 tab === 'generations' ? 'Генерации' :
                 tab === 'subscriptions' ? 'Подписки' :
                 'Транзакции'}
              </button>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <i className="fas fa-exclamation-circle text-red-500 mr-2"></i>
              <p className="text-red-700">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  if (activeTab === 'stats') {
                    loadStats()
                  } else {
                    loadData()
                  }
                }}
                className="ml-auto px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Повторить
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {activeTab === 'stats' && (
          <>
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
                Загрузка статистики...
              </div>
            ) : stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Пользователи</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.users.total}</p>
              <p className="text-xs text-gray-500 mt-1">Активных: {stats.users.active}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Генерации</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.generations.total}</p>
              <p className="text-xs text-gray-500 mt-1">Завершено: {stats.generations.completed}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Подписки</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.subscriptions.total}</p>
              <p className="text-xs text-gray-500 mt-1">Активных: {stats.subscriptions.active}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Кредиты</h3>
              <p className="text-2xl font-bold text-gray-900">{stats.credits.total}</p>
              <p className="text-xs text-gray-500 mt-1">Всего в системе</p>
            </div>
          </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                Нет данных для отображения
              </div>
            )}
          </>
        )}

        {(activeTab !== 'stats') && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Загрузка...</div>
            ) : data.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Нет данных</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      {activeTab === 'users' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Имя</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telegram ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Источник</th>
                        </>
                      )}
                      {activeTab === 'generations' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Пользователь</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Создано</th>
                        </>
                      )}
                      {activeTab === 'subscriptions' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">План</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Статус</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Кредиты</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Пользователь</th>
                        </>
                      )}
                      {activeTab === 'transactions' && (
                        <>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Сумма</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Баланс до</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Баланс после</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                        </>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 font-mono">{item.id?.substring(0, 8)}...</td>
                        {activeTab === 'users' && (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.username || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.firstName || '-'} {item.lastName || ''}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.telegramId || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.source || '-'}</td>
                          </>
                        )}
                        {activeTab === 'generations' && (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.userGeneration?.generationType || item.generationType || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded text-xs ${
                                (item.status || item.userGeneration?.status) === 'completed' ? 'bg-green-100 text-green-800' :
                                (item.status || item.userGeneration?.status) === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {item.status || item.userGeneration?.status || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.user?.username || item.user?.firstName || item.userId?.substring(0, 8) || '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ru-RU') : '-'}
                            </td>
                          </>
                        )}
                        {activeTab === 'subscriptions' && (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.plan?.planName || '-'}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded text-xs ${
                                item.status === 'active' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {item.status || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.creditsBalance || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.user?.username || item.user?.firstName || '-'}
                            </td>
                          </>
                        )}
                        {activeTab === 'transactions' && (
                          <>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.type || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.amount || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.balanceBefore || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{item.balanceAfter || 0}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ru-RU') : '-'}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(item)}
                              className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Edit Modal */}
        {editing && selectedItem && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Редактирование</h2>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setSelectedItem(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                <div className="space-y-2">
                  {Object.entries(selectedItem)
                    .filter(([key]) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt')
                    .map(([key, value]) => renderField(key, value))}
                </div>

                <div className="mt-6 flex gap-2">
                  <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
                  >
                    <i className="fas fa-save mr-2"></i>
                    Сохранить
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setSelectedItem(null)
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

