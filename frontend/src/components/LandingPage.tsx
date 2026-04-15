import { useState, useEffect, useRef } from 'react'
import AuthModal from './AuthModal'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const router = useRouter()

  const handleAuthSuccess = async () => {
    setShowAuth(false)

    // Применяем реферальный код, если пользователь пришёл по реферальной ссылке
    const referralCode = localStorage.getItem('преподавai_referral_code')
    if (referralCode) {
      try {
        await apiClient.post('/referrals/apply', { code: referralCode })
      } catch (e) {
        // Код невалидный или уже применён — не блокируем переход
      } finally {
        localStorage.removeItem('преподавai_referral_code')
      }
    }

    router.push('/dashboard')
  }

  const testimonials = [
    { name: "Елена К.", role: "Репетитор по математике", text: "Раньше тратила 3-4 часа на подготовку вариантов. Теперь генерирую полный вариант ОГЭ за 5 минут!", avatar: "👩‍🏫" },
    { name: "Дмитрий Р.", role: "Преподаватель физики", text: "SVG-чертежи для задач рисуются автоматически, не нужно ничего делать руками.", avatar: "👨‍🔬" },
    { name: "Анна М.", role: "Репетитор по английскому", text: "AI-аудит пробного урока открыл глаза на ошибки. Конверсия выросла с 30% до 65%.", avatar: "👩‍💼" },
    { name: "Сергей В.", role: "Репетитор по русскому", text: "Создаю материалы для 15 учеников индивидуально. Раньше это было невозможно.", avatar: "👨‍🏫" },
    { name: "Ольга Т.", role: "Преподаватель химии", text: "Структурные формулы генерируются автоматически. Больше не рисую в Paint.", avatar: "👩‍🔬" },
  ];

  useEffect(() => {
    const t = setInterval(() => setCurrentTestimonial((p) => (p + 1) % testimonials.length), 5000);
    return () => clearInterval(t);
  }, [testimonials.length]);

  const features = [
    {
      title: "Конструктор материалов", desc: "Рабочие листы, тесты и упражнения", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, fontFamily: "'Times New Roman',serif", color: "#1a1a1a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 8 }}><span style={{ fontWeight: "bold", fontSize: 13 }}>Рабочий лист</span><span style={{ color: "#999", fontSize: 10 }}>Имя: ___</span></div>
          <p style={{ fontWeight: "bold", marginBottom: 2 }}>1. Решите:</p>
          <p style={{ textAlign: "center", fontSize: 14, margin: "6px 0" }}>3x² − 12 = 0</p>
          <div style={{ borderBottom: "1px solid #ccc", height: 18, margin: "2px 0" }} />
          <div style={{ borderBottom: "1px solid #ccc", height: 18, margin: "2px 0" }} />
        </div>
      )
    },
    {
      title: "Планировщик уроков", desc: "Планы с целями и таймингом", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, color: "#ea580c", marginBottom: 8 }}>📋 План урока</p>
          <div style={{ display: "flex", gap: 4, alignItems: "center", background: "#fef3c7", borderRadius: 6, padding: "4px 8px", marginBottom: 8, fontSize: 11 }}><span>🎯</span><span>3 этапа · 45 мин</span></div>
          {["Разминка · 5 мин", "Объяснение · 15 мин", "Практика · 20 мин"].map((s, i) => (
            <div key={i} style={{ borderLeft: "2px solid #f59e0b", paddingLeft: 8, marginBottom: 4 }}><p style={{ margin: 0, color: "#555" }}>{s}</p></div>
          ))}
        </div>
      )
    },
    {
      title: "Ассистент по оценке", desc: "Обратная связь по работам учеников", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>✅ Обратная связь</p>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}><span style={{ color: "#16a34a" }}>✓ Верно: задания 1–3</span></div>
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}><span style={{ color: "#dc2626" }}>✗ Ошибка в задании 4</span></div>
          <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "4px 8px" }}><span style={{ color: "#2563eb" }}>💡 Повторить тему</span></div>
        </div>
      )
    },
    {
      title: "AI-ассистент", desc: "Методическая поддержка 24/7", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>💬 AI-чат</p>
          <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "6px 10px", marginBottom: 6, color: "#555" }}>Как объяснить дроби?</div>
          <div style={{ background: "#fff7ed", borderRadius: 8, padding: "6px 10px", border: "1px solid #fed7aa", color: "#444" }}>Используйте аналогию с пиццей...</div>
        </div>
      )
    },
    {
      title: "Генератор изображений", desc: "Иллюстрации для материалов", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12 }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8, color: "#1a1a1a" }}>🖼️ Генерация</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {["🧬", "🌍", "⚗️", "📐"].map((e, i) => (
              <div key={i} style={{ aspectRatio: "1", background: "linear-gradient(135deg,#fff7ed,#fef3c7)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: "1px solid #fed7aa" }}>{e}</div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: "Создание презентаций", desc: "Слайды за минуты", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>📊 Презентация</p>
          <div style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", borderRadius: 8, padding: 8, color: "white", marginBottom: 6 }}><p style={{ fontWeight: "bold", fontSize: 13, margin: 0 }}>Квадратные уравнения</p><p style={{ fontSize: 10, opacity: 0.8, margin: "2px 0 0" }}>8 класс</p></div>
          <div style={{ display: "flex", gap: 4 }}>{[1, 2, 3, 4].map(n => (<div key={n} style={{ flex: 1, aspectRatio: "4/3", background: "#f5f5f5", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#bbb", border: "1px solid #eee" }}>Слайд {n}</div>))}</div>
        </div>
      )
    },
    {
      title: "Шаблоны сообщений", desc: "Переписка с родителями", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>✉️ Шаблоны</p>
          {["Отчёт об успеваемости", "Перенос занятия", "Домашнее задание"].map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: i < 2 ? "1px solid #f5f5f5" : "none" }}>
              <span style={{ width: 20, height: 20, borderRadius: 4, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>📩</span><span style={{ color: "#555" }}>{t}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      title: "Интерактивные игры", desc: "Игры для уроков", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>🎮 Игры</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {["🎯 Викторина", "🧩 Пазл", "🏆 Квиз", "🎲 Кроссворд"].map((g, i) => (
              <div key={i} style={{ background: "linear-gradient(135deg,#fffbeb,#fff7ed)", borderRadius: 8, padding: 6, textAlign: "center", border: "1px solid #fed7aa", fontSize: 11 }}>{g}</div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: "Генератор комментариев", desc: "Комментарии к работам", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>💬 Комментарий</p>
          <div style={{ background: "#eff6ff", borderRadius: 8, padding: 8, border: "1px solid #bfdbfe", fontSize: 11, color: "#333" }}>«Хорошо справился с вычислениями. Подписывай единицы измерения.»</div>
        </div>
      )
    },
    {
      title: "Генератор тестов", desc: "Тесты с вариантами ответов", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 6 }}>🎯 Тест</p>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Столица Франции?</p>
          {["Лондон", "Париж", "Берлин", "Мадрид"].map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", color: i === 1 ? "#16a34a" : "#888", fontWeight: i === 1 ? 600 : 400 }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${i === 1 ? "#16a34a" : "#ccc"}`, background: i === 1 ? "#16a34a" : "transparent", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>{i === 1 ? "✓" : ""}</span>{a}
            </div>
          ))}
        </div>
      )
    },
    {
      title: "Планы уроков", desc: "Поурочные планы", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>📋 План</p>
          {["Орг. момент — 2 мин", "Актуализация — 5 мин", "Новая тема — 15 мин", "Закрепление — 15 мин"].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff7ed", color: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: "bold" }}>{i + 1}</span>
              <span style={{ color: "#555" }}>{s}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      title: "Адаптация контента", desc: "Под уровень ученика", preview: (
        <div style={{ background: "white", borderRadius: 8, padding: 12, boxShadow: "0 1px 2px rgba(0,0,0,.05)", border: "1px solid #f0f0f0", fontSize: 12, color: "#1a1a1a" }}>
          <p style={{ fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>🔄 Адаптация</p>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["Начальный", "Средний", "Старший"].map((l, i) => (
              <span key={i} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 10, fontWeight: 600, background: i === 1 ? "#f97316" : "#f5f5f5", color: i === 1 ? "white" : "#888" }}>{l}</span>
            ))}
          </div>
          <p style={{ color: "#888", fontSize: 11 }}>Автоматически подстроено под средний уровень</p>
        </div>
      )
    },
  ];

  const S = { page: { minHeight: "100vh", background: "#fafaf8", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#1a1a1a" } };

  return (
    <div style={S.page}>
      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)", background: "rgba(255,255,255,0.92)", borderBottom: "1px solid #f0f0f0", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, overflow: "hidden" }}>
            <img src="https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.03em" }}>Преподавай</span>
        </div>
        <button onClick={() => { setAuthMode('login'); setShowAuth(true); }} style={{ padding: "9px 20px", background: "#f97316", color: "white", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Войти</button>
      </header>

      {/* HERO */}
      <section style={{ padding: "56px 24px 40px", overflow: "hidden" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 48, alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 16px" }}>
              <span style={{ background: "linear-gradient(90deg,#f97316,#f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Будущее</span><br />образования с ИИ
            </h1>
            <p style={{ fontSize: 17, color: "#888", marginBottom: 28, lineHeight: 1.6, maxWidth: 440 }}>Экономьте время на подготовку и повысьте его качество с помощью продвинутых ИИ-инструментов</p>
            <button onClick={() => { setAuthMode('register'); setShowAuth(true); }} style={{ padding: "14px 32px", background: "#f97316", color: "white", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(249,115,22,0.25)" }}>Попробовать бесплатно</button>
          </div>

          {/* DASHBOARD MOCKUP */}
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", inset: -20, background: "radial-gradient(ellipse at center, rgba(249,115,22,0.08), transparent 70%)", borderRadius: 32 }} />
            <div style={{ position: "relative", background: "white", borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)", border: "1px solid #e5e5e5", overflow: "hidden" }}>
              <div style={{ display: "flex", minHeight: 360 }}>
                {/* Sidebar */}
                <div style={{ width: 160, background: "white", borderRight: "1px solid #f0f0f0", padding: 14, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 20 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#f97316,#ea580c)" }} />
                    <span style={{ fontWeight: 900, fontSize: 12 }}>Преподавай</span>
                  </div>
                  {[{ i: "🏠", l: "Главная", a: true }, { i: "🤖", l: "ИИ Генератор" }, { i: "📁", l: "Материалы" }, { i: "👥", l: "Ученики" }, { i: "📊", l: "Аналитика" }, { i: "⚙️", l: "Настройки" }].map((x, j) => (
                    <div key={j} style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 8, fontSize: 11, color: x.a ? "#ea580c" : "#999", background: x.a ? "#fff7ed" : "transparent", fontWeight: x.a ? 600 : 400, marginBottom: 1 }}>{x.i} {x.l}</div>
                  ))}
                </div>
                {/* Main */}
                <div style={{ flex: 1, padding: "16px 20px", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 19, fontWeight: 900, margin: "0 0 3px" }}>Главная</h2>
                      <p style={{ fontSize: 10, color: "#999", margin: 0, maxWidth: 340 }}>Профессиональный инструмент для учителей</p>
                    </div>
                    <div style={{ background: "#ea580c", color: "white", padding: "7px 14px", borderRadius: 9, fontSize: 11, fontWeight: 700 }}>⊕ Создать</div>
                  </div>
                  {/* Form */}
                  <div style={{ background: "white", borderRadius: 12, border: "1px solid #eee", padding: 12, marginBottom: 12 }}>
                    <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: "#aaa", marginBottom: 3 }}>Тема урока</div>
                        <div style={{ padding: "7px 10px", border: "1px solid #e5e5e5", borderRadius: 8, fontSize: 11, color: "#ccc" }}>например, Фотосинтез</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#aaa", marginBottom: 3 }}>Класс</div>
                        <div style={{ display: "flex", gap: 3 }}>
                          <span style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 10, color: "#aaa" }}>Начальный</span>
                          <span style={{ padding: "7px 12px", borderRadius: 8, background: "#ea580c", color: "white", fontSize: 10, fontWeight: 600 }}>Средний</span>
                          <span style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #e5e5e5", fontSize: 10, color: "#aaa" }}>Старший</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Cards */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, background: "white", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                      <div style={{ width: 28, height: 28, background: "#fff7ed", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginBottom: 6 }}>📊</div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>Презентация</div>
                      <div style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>Создайте слайды</div>
                    </div>
                    <div style={{ flex: 1, background: "white", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                      <div style={{ width: 28, height: 28, background: "#fef3c7", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginBottom: 6 }}>❓</div>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>Тест</div>
                      <div style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>Сгенерируйте тест</div>
                    </div>
                    <div style={{ flex: 1, background: "white", border: "1px dashed #ddd", borderRadius: 10, padding: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ textAlign: "center", color: "#ccc", fontSize: 10 }}><div style={{ fontSize: 18 }}>+</div>Добавить</div>
                    </div>
                  </div>
                  {/* Stats */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["📁", "17", "Материалов"], ["✅", "564", "Генераций"], ["💰", "1 250", "Токенов"], ["⏱️", "48h", "Сэкономлено"]].map(([ic, v, lb], j) => (
                      <div key={j} style={{ flex: 1, background: "white", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{ic}</span>
                        <div><div style={{ fontWeight: 900, fontSize: 14 }}>{v}</div><div style={{ fontSize: 8, color: "#aaa" }}>{lb}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS */}
      <section style={{ padding: "72px 24px", background: "white" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 48 }}>Создано для обучения</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              { icon: "🎯", title: "Персонализация", desc: "Материалы адаптируются под каждого ученика по уровню" },
              { icon: "📈", title: "Результаты", desc: "Инструменты для лучших результатов на экзаменах" },
              { icon: "⏰", title: "Экономия времени", desc: "Генерируйте материалы за минуты, не часы" },
            ].map((b, i) => (
              <div key={i} style={{ padding: 24, borderRadius: 16, border: "1px solid #f0f0f0", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, margin: "0 auto 14px", borderRadius: 14, background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: "0 6px 20px rgba(249,115,22,0.2)" }}>{b.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{b.title}</h3>
                <p style={{ color: "#888", fontSize: 14, lineHeight: 1.5 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section style={{ padding: "72px 24px", background: "#fafaf8" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 32, fontWeight: 900, marginBottom: 48 }}>Все инструменты в одном месте</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {features.map((f, i) => (
              <div key={i} style={{ background: "white", borderRadius: 16, border: "1px solid #f0f0f0", overflow: "hidden", transition: "box-shadow 0.2s, border-color 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#fed7aa" }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#f0f0f0" }}
              >
                <div style={{ padding: 10, background: "#fafaf8", borderBottom: "1px solid #f0f0f0" }}>{f.preview}</div>
                <div style={{ padding: 14 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>{f.title}</h3>
                  <p style={{ fontSize: 12, color: "#999", lineHeight: 1.4 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: "72px 24px", background: "white", overflow: "hidden" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 900, marginBottom: 40 }}>
            Почему учителя выбирают Преподавай
          </h2>
          <div style={{ display: "flex", gap: 20, transition: "transform 0.5s ease", transform: `translateX(-${currentTestimonial * 310}px)` }}>
            {testimonials.map((t, i) => (
              <div key={i} style={{ flexShrink: 0, width: 290, padding: 20, borderRadius: 16, border: `1px solid ${i === currentTestimonial ? "#fed7aa" : "#f0f0f0"}`, background: i === currentTestimonial ? "#fffbeb" : "white", boxShadow: i === currentTestimonial ? "0 8px 30px rgba(249,115,22,0.1)" : "none", transition: "all 0.3s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{t.avatar}</div>
                  <div><p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{t.name}</p><p style={{ fontSize: 11, color: "#999", margin: 0 }}>{t.role}</p></div>
                </div>
                <p style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>&quot;{t.text}&quot;</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 28 }}>
            {testimonials.map((_, i) => (
              <button key={i} onClick={() => setCurrentTestimonial(i)} style={{ width: i === currentTestimonial ? 24 : 10, height: 10, borderRadius: 99, background: i === currentTestimonial ? "#f97316" : "#e5e5e5", border: "none", cursor: "pointer", transition: "all 0.3s" }} />
            ))}
          </div>
        </div>
      </section>

      {/* TRUST & SECURITY */}
      <section style={{ padding: "72px 24px", background: "#fafaf8" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 900, marginBottom: 40 }}>Доверие и Безопасность</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 32 }}>
            {[
              { icon: "🔒", title: "Защита данных", desc: "Шифрование и безопасное хранение", bg: "linear-gradient(135deg,#fff7ed,#fef3c7)" },
              { icon: "🛡️", title: "Безопасность ИИ", desc: "Контролируемая генерация контента", bg: "linear-gradient(135deg,#eff6ff,#dbeafe)" },
              { icon: "🔐", title: "Конфиденциальность", desc: "Защита данных учеников", bg: "linear-gradient(135deg,#f0fdf4,#dcfce7)" },
              { icon: "✅", title: "Соответствие ФИПИ", desc: "Строго по образовательным стандартам", bg: "linear-gradient(135deg,#faf5ff,#f3e8ff)" },
            ].map((x, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: 18, borderRadius: 16, background: x.bg, border: "1px solid #f0f0f0" }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{x.icon}</span>
                <div><h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{x.title}</h3><p style={{ color: "#888", fontSize: 13 }}>{x.desc}</p></div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { icon: "🏅", title: "Сертификации", desc: "Одобрено образовательным сообществом" },
              { icon: "📚", title: "Обучение", desc: "Руководства по использованию ИИ" },
              { icon: "🤝", title: "Сообщество", desc: "Тысячи преподавателей" },
            ].map((x, i) => (
              <div key={i} style={{ textAlign: "center", padding: 20, borderRadius: 16, border: "1px solid #f0f0f0", background: "white" }}>
                <div style={{ width: 48, height: 48, margin: "0 auto 10px", borderRadius: 14, background: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{x.icon}</div>
                <h3 style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{x.title}</h3>
                <p style={{ color: "#888", fontSize: 13 }}>{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "48px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ background: "linear-gradient(135deg,#f97316,#ea580c)", borderRadius: 24, padding: "56px 40px", textAlign: "center", color: "white", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, background: "rgba(255,255,255,0.05)", borderRadius: "50%" }} />
            <div style={{ position: "absolute", bottom: -30, left: -30, width: 150, height: 150, background: "rgba(255,255,255,0.05)", borderRadius: "50%" }} />
            <div style={{ position: "relative" }}>
              <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 10 }}>Начните создавать будущее образования</h2>
              <p style={{ fontSize: 17, opacity: 0.85, marginBottom: 28 }}>Начните создавать материалы для учащихся уже сегодня</p>
              <button onClick={() => { setAuthMode('register'); setShowAuth(true); }} style={{ padding: "14px 36px", background: "white", color: "#ea580c", border: "none", borderRadius: 16, fontSize: 17, fontWeight: 900, cursor: "pointer" }}>Начать сейчас</button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: "32px 24px", background: "white", borderTop: "1px solid #f0f0f0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 13, color: "#bbb" }}>
          <span>© 2025 Преподавай — ИИ-помощник для репетиторов</span>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link href="/legal/offer" style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Оферта</Link>
            <Link href="/legal/terms" style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Условия</Link>
            <Link href="/legal/privacy" style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Конфиденциальность</Link>
            <Link href="/legal/consent/processing" style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Обработка ПД</Link>
            <Link href="/legal/consent/mailing" style={{ cursor: "pointer", color: "inherit", textDecoration: "none" }}>Рассылка</Link>
          </div>
        </div>
      </footer>

      {/* AUTH MODAL */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSuccess={handleAuthSuccess}
          initialMode={authMode}
        />
      )}
    </div>
  );
}
