'use client'

import { useState } from 'react'
import AuthModal from './AuthModal'

export default function LandingPage() {
  const [showAuthModal, setShowAuthModal] = useState(false)

  const features = [
    {
      icon: 'fas fa-file-alt',
      title: 'Конструктор материалов',
      description: 'Создавайте рабочие листы, тесты и упражнения за минуты'
    },
    {
      icon: 'fas fa-calendar-alt',
      title: 'Планировщик уроков',
      description: 'Генерируйте детальные планы уроков и учебные программы'
    },
    {
      icon: 'fas fa-check-circle',
      title: 'Ассистент по оценке',
      description: 'Получайте детальную обратную связь по работам учеников'
    },
    {
      icon: 'fas fa-exchange-alt',
      title: 'Адаптация контента',
      description: 'Адаптируйте материалы под уровень ваших учеников'
    },
    {
      icon: 'fas fa-comments',
      title: 'AI-ассистент',
      description: 'Задавайте вопросы и получайте методическую поддержку'
    },
    {
      icon: 'fas fa-image',
      title: 'Генератор изображений',
      description: 'Создавайте уникальные иллюстрации для уроков'
    },
    {
      icon: 'fas fa-presentation',
      title: 'Создание презентаций',
      description: 'Генерируйте структуру презентаций автоматически'
    },
    {
      icon: 'fas fa-envelope',
      title: 'Шаблоны сообщений',
      description: 'Готовые шаблоны для переписки с родителями'
    },
    {
      icon: 'fas fa-envelope',
      title: 'Создание интерактивных игр',
      description: 'Готовые шаблоны игр для уроков'
    }
  ]

  const scrollToFeatures = () => {
    const element = document.getElementById('features')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleAuthSuccess = () => {
    setShowAuthModal(false)
    window.location.reload()
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/80 border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden">
                <img
                  src="https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x"
                  alt="prepodavAI"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="flex-shrink-0 text-2xl font-bold bg-gradient-to-r from-orange-600 to-orange-500 bg-clip-text text-transparent">
                prepodavAI
              </span>
            </div>
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <i className="fas fa-user mr-2"></i>
              Войти
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-orange-600 via-orange-500 to-orange-600 bg-clip-text text-transparent">
                ИИ-помощник
              </span>
              <br />
              <span className="text-gray-900">
                для преподавателей
              </span>
            </h1>
            <p className="text-xl sm:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Автоматизируйте подготовку к урокам, создавайте учебные материалы и экономьте до 10 часов в неделю с помощью искусственного интеллекта
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl text-lg font-semibold hover:shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2"
              >
                <i className="fas fa-rocket"></i>
                Начать бесплатно
              </button>
              <button
                onClick={scrollToFeatures}
                className="px-8 py-4 bg-white text-orange-600 rounded-2xl text-lg font-semibold border-2 border-orange-200 hover:border-orange-300 hover:shadow-lg transition-all duration-300 flex items-center gap-2"
              >
                <i className="fas fa-play-circle"></i>
                Узнать больше
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Все инструменты в одном месте
            </h2>
            <p className="text-xl text-gray-600">
              Более 10 ИИ-инструментов для вашей преподавательской деятельности
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl border-2 border-orange-100 hover:border-orange-300 hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-orange-50/30"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-4">
                  <i className={`${feature.icon} text-white text-2xl`}></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-orange-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Почему выбирают prepodavAI?
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <i className="fas fa-clock text-white text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Экономия времени</h3>
              <p className="text-lg text-gray-600">Сокращайте время подготовки к урокам в 5-10 раз</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <i className="fas fa-brain text-white text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Умный ИИ</h3>
              <p className="text-lg text-gray-600">Используем GPT-4 и Claude для создания качественных материалов</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <i className="fas fa-star text-white text-3xl"></i>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Простота использования</h3>
              <p className="text-lg text-gray-600">Интуитивный интерфейс, не требующий обучения</p>
            </div>
          </div>
        </div>
      </section> */}

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-orange-500 to-orange-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Готовы начать?
          </h2>
          <p className="text-xl text-orange-50 mb-8">
            Присоединяйтесь к тысячам репетиторов, которые уже используют ИИ в своей работе
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-10 py-5 bg-white text-orange-600 rounded-2xl text-xl font-bold hover:shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
          >
            <i className="fas fa-arrow-right mr-2"></i>
            Начать бесплатно
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400 text-center">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 flex-wrap">
          <p>&copy; 2025 prepodavAI - ИИ-помощник для репетиторов</p>
          <span className="hidden sm:inline text-gray-600">|</span>
          <a
            href="/public-offer"
            className="text-orange-400 hover:text-orange-300 underline transition-colors duration-200"
          >
            Публичная оферта
          </a>
          <span className="hidden sm:inline text-gray-600">|</span>
          <a
            href="/privacy-policy"
            className="text-orange-400 hover:text-orange-300 underline transition-colors duration-200"
          >
            Политика конфиденциальности
          </a>
          <span className="hidden sm:inline text-gray-600">|</span>
          <a
            href="/personal-data"
            className="text-orange-400 hover:text-orange-300 underline transition-colors duration-200"
          >
            Согласие на обработку ПД
          </a>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}
    </div>
  )
}
