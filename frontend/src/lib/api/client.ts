import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
apiClient.interceptors.request.use((config) => {
  // Auth is handled by httpOnly cookies (withCredentials: true)
  // No need to manually inject tokens

  // Для FormData не устанавливаем Content-Type
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

// Обработка ошибок
let isRedirecting = false;

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn('Unauthorized request to:', error.config.url);
      
      if (typeof window !== 'undefined' && !isRedirecting) {
        const pathname = window.location.pathname;
        
        // Сначала убираем флаги
        localStorage.removeItem('prepodavai_authenticated');
        localStorage.removeItem('prepodavai_user');
        
        // Редиректим только если:
        // 1. Мы не на главной
        // 2. Мы не на странице логина (обычного или админского)
        // 3. Мы не в админке (у неё своя логика редиректа в layout.tsx)
        if (pathname.startsWith('/student')) {
          isRedirecting = true;
          localStorage.removeItem('user');
            window.location.href = '/student/login';
        } else if (
          pathname !== '/' &&
          !pathname.startsWith('/login') &&
          !pathname.startsWith('/admin')
        ) {
          isRedirecting = true;
          window.location.href = '/';
        }
      }
    }
    return Promise.reject(error)
  }
)

