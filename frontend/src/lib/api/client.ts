import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Добавляем токен в запросы
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('prepodavai_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Для FormData не устанавливаем Content-Type, браузер сам установит с boundary
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

// Обработка ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен истек или невалиден
      localStorage.removeItem('prepodavai_token')
      localStorage.removeItem('prepodavai_authenticated')
      window.location.href = '/'
    }
    return Promise.reject(error)
  }
)

