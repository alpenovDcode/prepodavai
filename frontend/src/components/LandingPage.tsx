'use client'
import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import AuthModal from './AuthModal'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api/client'

// Появление блока при скролле (fade + slide up)
function Reveal({ children, delay = 0, style = {} }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ ...style, opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(28px)', transition: `opacity .7s ease ${delay}ms, transform .7s cubic-bezier(.22,1,.36,1) ${delay}ms` }}>
      {children}
    </div>
  );
}

// Анимированный счётчик — запускается, когда блок попадает в зону видимости
function CountUp({ to, fmt, duration = 1400 }: { to: number; fmt: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVal(to); return; }
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return;
      started.current = true;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(to * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);
  return <div ref={ref}>{fmt(val)}</div>;
}

export default function LandingPage({ autoOpenAuth = false }: { autoOpenAuth?: boolean }) {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [stackHover, setStackHover] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const router = useRouter()

  useEffect(() => {
    if (autoOpenAuth) { setAuthMode('register'); setShowAuth(true); }
  }, [autoOpenAuth]);

  useEffect(() => {
    if (typeof window === 'undefined') return
    const referralCode = localStorage.getItem('prepodavai_referral_code')
    if (referralCode) { setAuthMode('register'); setShowAuth(true); }
  }, []);

  // auto-scroll carousel
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let frame: number;
    let pos = 0;
    const speed = 0.35;
    const step = () => {
      pos += speed;
      if (pos >= el.scrollWidth / 2) pos = 0;
      el.scrollLeft = pos;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const pause = () => cancelAnimationFrame(frame);
    const resume = () => { frame = requestAnimationFrame(step); };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('mouseenter', pause);
      el.removeEventListener('mouseleave', resume);
    };
  }, []);

  const handleAuthSuccess = async () => {
    setShowAuth(false)
    const referralCode = localStorage.getItem('prepodavai_referral_code')
    if (referralCode) {
      try { await apiClient.post('/referrals/apply', { code: referralCode }) } catch (_) { /* ignore */ }
      finally { localStorage.removeItem('prepodavai_referral_code') }
    }
    router.push('/dashboard')
  }

  const openRegister = () => { setAuthMode('register'); setShowAuth(true); }
  const openLogin = () => { setAuthMode('login'); setShowAuth(true); }

  const DARK = "#1a1410";
  const DARK_DEEP = "#120e0a";

  const steps = [
    { n: "01", title: "Опишите тему урока", desc: "Введите тему, класс и уровень учеников. Можно одним предложением." },
    { n: "02", title: "Выберите формат", desc: "Рабочий лист, тест, план урока, презентация или всё сразу." },
    { n: "03", title: "Получите готовый материал", desc: "ИИ создаёт полноценный документ за секунды. Скачайте или сразу используйте." },
  ];

  const tools = [
    { icon: "📋", title: "Рабочие листы", desc: "С задачами, полями для ответов и оформлением", accent: "#f97316" },
    { icon: "🎯", title: "Тесты и квизы", desc: "С вариантами ответов и автоматической проверкой", accent: "#e11d48" },
    { icon: "📊", title: "Презентации", desc: "Слайды со структурой и иллюстрациями", accent: "#7c3aed" },
    { icon: "📝", title: "Планы уроков", desc: "С целями, этапами и таймингом по ФГОС", accent: "#0891b2" },
    { icon: "💬", title: "ИИ-ассистент", desc: "Методическая поддержка и ответы на вопросы 24/7", accent: "#059669" },
    { icon: "🔄", title: "Адаптация под уровень", desc: "Один материал — три версии сложности автоматически", accent: "#d97706" },
  ];

  const testimonials = [
    { name: "Елена К.", role: "Репетитор по математике", initials: "ЕК", color: "#f97316", text: "Раньше тратила 3–4 часа на подготовку вариантов. Теперь генерирую полный вариант ОГЭ за 5 минут. Честно, не верила пока не попробовала." },
    { name: "Дмитрий Р.", role: "Учитель физики, школа №47", initials: "ДР", color: "#7c3aed", text: "Рабочие листы с чертежами теперь готовятся автоматически. Сэкономил примерно 6 часов в неделю." },
    { name: "Анна М.", role: "Репетитор английского", initials: "АМ", color: "#0891b2", text: "После AI-аудита пробного урока конверсия выросла с 30% до 65%. Конкретно видно, где теряешь ученика." },
  ];

  // carousel items — pairs of (label, grade/subject, content preview as jsx-compatible data)
  const carouselItems = [
    {
      type: "Презентация", grade: "9 класс",
      bg: "linear-gradient(160deg, #2d1f15 0%, #1f1510 100%)",
      content: (
        <div style={{ padding: "24px 20px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Биология · 9 класс</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1.25, marginBottom: 14 }}>Эволюция животного мира</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 20 }}>Основные закономерности исторического развития организмов: от простейших до высокоорганизованных млекопитающих</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["#f97316","#fbbf24","#10b981"].map((c,i) => <div key={i} style={{ height: 4, borderRadius: 2, background: c, flex: i === 0 ? 2 : 1 }} />)}
          </div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {["Слайд 1","Слайд 2","Слайд 3","Слайд 4"].map((s,i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "8px", fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center" as const }}>{s}</div>
            ))}
          </div>
        </div>
      )
    },
    {
      type: "Рабочий лист", grade: "10 класс",
      bg: "white",
      content: (
        <div style={{ padding: "22px 18px", fontFamily: "'Times New Roman', serif", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ borderBottom: "2px solid #333", paddingBottom: 6, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>РАБОЧИЙ ЛИСТ</span>
            <span style={{ fontSize: 10, color: "#aaa" }}>10 класс · Химия</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#222", marginBottom: 8, fontFamily: "sans-serif" }}>Типы гибридизации атомов углерода</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.55, marginBottom: 10 }}>Выберите верные утверждения о гибридизации атомов углерода в органических соединениях:</div>
          {["sp³-гибридизация возникает при смешивании одной s- и трёх p-орбиталей, образуя тетраэдрическую форму молекулы", "В молекуле метана атом углерода находится в sp³-гибридизации"].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", marginBottom: 7 }}>
              <div style={{ width: 13, height: 13, border: "1.5px solid #bbb", borderRadius: 3, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 10.5, color: "#555", lineHeight: 1.5 }}>{t}</div>
            </div>
          ))}
          <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 10 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, fontFamily: "sans-serif" }}>Заполните пропуски:</div>
            <div style={{ borderBottom: "1px solid #bbb", height: 20, marginBottom: 6 }} />
            <div style={{ borderBottom: "1px solid #bbb", height: 20 }} />
          </div>
        </div>
      )
    },
    {
      type: "Инфографика", grade: "8 класс",
      bg: "#faf6ef",
      content: (
        <div style={{ padding: "22px 18px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ textAlign: "center" as const, marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#2d1b00", letterSpacing: "0.02em", lineHeight: 1.3 }}>АНАЛИЗ ХАРАКТЕРА ГЕРОЯ</div>
            <div style={{ fontSize: 11, color: "#8b6914", marginTop: 4 }}>Ключевые вопросы для исследования</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { l: "МОТИВЫ И ЦЕЛИ", q: "Что движет героем?\nЖелания · Страсти · Внутренний мир", accent: false },
              { l: "ПОСТУПКИ И РЕШЕНИЯ", q: "Как действует герой?\nВыбор · Конфликты · Изменения", accent: false },
              { l: "ЛИТЕРАТУРНЫЙ ГЕРОЙ", q: "Образ в тексте", accent: true },
              { l: "ВЛИЯНИЕ НА ДРУГИХ", q: "Как герой взаимодействует?\nОтношения · Диалог", accent: false },
            ].map((x, i) => (
              <div key={i} style={{ background: x.accent ? "#f59e0b" : "rgba(0,0,0,0.06)", borderRadius: 8, padding: "10px", textAlign: "center" as const }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: x.accent ? "white" : "#5c3d00", letterSpacing: "0.04em", marginBottom: 4 }}>{x.l}</div>
                <div style={{ fontSize: 9, color: x.accent ? "rgba(255,255,255,0.85)" : "#8b6914", lineHeight: 1.45, whiteSpace: "pre-line" as const }}>{x.q}</div>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      type: "Презентация", grade: "6 класс",
      bg: "linear-gradient(160deg, #2d1f15, #1f1510)",
      content: (
        <div style={{ padding: "24px 20px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ fontSize: 11, color: "#fb923c", marginBottom: 10, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>Математика · 6 класс</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1.25, marginBottom: 16 }}>Ноль и единица под корнем</div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {[
              "Существуют два случая, которые нужно запомнить.",
              "Корень из нуля = 0, так как только 0 при умножении на 0 даёт 0.",
              "√1 = 1, так как 1 в квадрате = 1.",
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", paddingLeft: 12, borderLeft: "2px solid #f97316", lineHeight: 1.5 }}>{t}</div>
            ))}
          </div>
        </div>
      )
    },
    {
      type: "Рабочий лист", grade: "7 класс",
      bg: "white",
      content: (
        <div style={{ padding: "22px 18px", fontFamily: "'Times New Roman', serif", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ borderBottom: "2px solid #333", paddingBottom: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>РАБОЧИЙ ЛИСТ</div>
            <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Русский язык · 7 класс</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, fontFamily: "sans-serif", color: "#222" }}>Правописание приставок</div>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>1. Вставьте пропущенные буквы:</div>
          {["пр_ехать в город", "пр_красный вид", "пр_школьный участок", "пр_морский берег"].map((t, i) => (
            <div key={i} style={{ paddingLeft: 12, marginBottom: 5, color: "#555", fontSize: 11 }}>{i + 1}. {t}</div>
          ))}
          <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 5, fontFamily: "sans-serif" }}>Объясните правило:</div>
            <div style={{ borderBottom: "1px solid #bbb", height: 20, marginBottom: 6 }} />
            <div style={{ borderBottom: "1px solid #bbb", height: 20 }} />
          </div>
        </div>
      )
    },
    {
      type: "Тест", grade: "5 класс",
      bg: "#fffbf0",
      content: (
        <div style={{ padding: "22px 18px", height: "100%", boxSizing: "border-box" as const }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>ТЕСТ · История</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14, color: "#1a1a1a", lineHeight: 1.3 }}>Древний Египет</div>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 10, fontWeight: 600 }}>1. Как называлась главная река Египта?</div>
          {["Тигр", "Нил", "Евфрат", "Инд"].map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", color: i === 1 ? "#16a34a" : "#777", fontWeight: i === 1 ? 700 : 400, fontSize: 12 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${i === 1 ? "#16a34a" : "#ddd"}`, background: i === 1 ? "#16a34a" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {i === 1 && <span style={{ color: "white", fontSize: 8 }}>✓</span>}
              </div>
              {a}
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: "#555", fontWeight: 600 }}>2. Кто возглавлял государство?</div>
        </div>
      )
    },
  ];

  // duplicate for infinite scroll
  const allItems = [...carouselItems, ...carouselItems];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f6", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#1a1a1a" }}>
      <style>{`
        @keyframes heroFadeUp { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes floatBlob { 0%, 100% { transform: translateX(-50%) translateY(0) scale(1); } 50% { transform: translateX(-50%) translateY(24px) scale(1.06); } }
        @keyframes pulseDot { 0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,.45); } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } }
        @keyframes caretBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .hero-anim > * { opacity: 0; animation: heroFadeUp .8s cubic-bezier(.22,1,.36,1) forwards; }
        .hero-anim > *:nth-child(1) { animation-delay: .05s; }
        .hero-anim > *:nth-child(2) { animation-delay: .18s; }
        .hero-anim > *:nth-child(3) { animation-delay: .32s; }
        .hero-anim > *:nth-child(4) { animation-delay: .46s; }
        .btn-cta { transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
        .btn-cta:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(249,115,22,.4) !important; filter: brightness(1.05); }
        .btn-cta:active { transform: translateY(0) scale(.98); }
        .btn-ghost { transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .btn-ghost:hover { transform: translateY(-2px); border-color: #fdba74 !important; box-shadow: 0 6px 18px rgba(0,0,0,.08) !important; }
        .btn-ghost:active { transform: translateY(0); }
        .tool-card { transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease; }
        .tool-card:hover { transform: translateY(-5px); box-shadow: 0 14px 36px rgba(0,0,0,.09) !important; border-color: #fed7aa !important; }
        .carousel-card { transition: transform .3s ease, box-shadow .3s ease; }
        .carousel-card:hover { transform: translateY(-8px); box-shadow: 0 24px 60px rgba(0,0,0,.45) !important; }
        .testi-card { transition: transform .25s ease, box-shadow .25s ease; }
        .testi-card:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(0,0,0,.08); }
        .step-wrap .step-icon { transition: transform .25s ease, box-shadow .25s ease; }
        .step-wrap:hover .step-icon { transform: translateY(-4px) scale(1.06); }
        .preview-shell { transition: transform .4s cubic-bezier(.22,1,.36,1), box-shadow .4s ease; }
        .preview-shell:hover { transform: translateY(-6px); box-shadow: 0 36px 80px rgba(0,0,0,.14), 0 4px 12px rgba(0,0,0,.07) !important; }
      `}</style>

      {/* ── HEADER ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)", background: "rgba(248,248,246,0.93)", borderBottom: "1px solid #ebebeb", padding: "0 32px", display: "flex", justifyContent: "space-between", alignItems: "center", height: 58 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, overflow: "hidden" }}>
            <img src="https://fs.cdn-chatium.io/thumbnail/image_gc_AmbUAlw8Yq.1024x1024.png/s/128x" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em" }}>Преподавай</span>
        </div>
        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={openLogin} style={{ padding: "7px 16px", background: "transparent", color: "#666", border: "none", borderRadius: 8, fontWeight: 500, fontSize: 14, cursor: "pointer" }}>Войти</button>
          <button className="btn-cta" onClick={openRegister} style={{ padding: "8px 18px", background: "#f97316", color: "white", border: "none", borderRadius: 9, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Начать бесплатно</button>
        </nav>
      </header>

      {/* ── HERO ── */}
      <section style={{ background: "#f8f8f6", padding: "88px 24px 64px", position: "relative", textAlign: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, #d1d1cc 1px, transparent 1px)", backgroundSize: "28px 28px", opacity: 0.45, pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -200, left: "50%", width: 900, height: 500, background: "radial-gradient(ellipse, rgba(249,115,22,0.08) 0%, transparent 65%)", pointerEvents: "none", animation: "floatBlob 9s ease-in-out infinite" }} />
        <div className="hero-anim" style={{ maxWidth: 780, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 99, background: "white", border: "1px solid #e8e8e8", fontSize: 12, fontWeight: 600, color: "#ea580c", marginBottom: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulseDot 2s ease-out infinite" }} />
            7 дней бесплатно — без привязки карты
          </div>
          <h1 style={{ fontSize: "clamp(38px, 5.5vw, 68px)", fontWeight: 900, lineHeight: 1.06, letterSpacing: "-0.04em", margin: "0 0 22px", color: "#1a120c" }}>
            Меньше рутины —
            <br />
            <span style={{ background: "linear-gradient(95deg, #f97316 20%, #f59e0b 80%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>больше классных уроков</span>
          </h1>
          <p style={{ fontSize: 17, color: "#777", maxWidth: 480, margin: "0 auto 38px", lineHeight: 1.7, fontWeight: 400 }}>
            ИИ-платформа для учителей и репетиторов: рабочие листы, тесты и планы уроков — за минуты, не часы.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-cta" onClick={openRegister} style={{ padding: "14px 32px", background: "#f97316", color: "white", border: "none", borderRadius: 11, fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(249,115,22,0.28)" }}>
              Попробовать бесплатно
            </button>
            <button className="btn-ghost" onClick={openLogin} style={{ padding: "14px 28px", background: "white", color: "#555", border: "1px solid #e0e0e0", borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              Войти в аккаунт
            </button>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ background: "white", borderTop: "1px solid #ebebeb", borderBottom: "1px solid #ebebeb", padding: "0 32px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { to: 5000, fmt: (v: number) => `${v.toLocaleString('ru-RU')}+`, label: "учителей" },
            { to: 200000, fmt: (v: number) => `${v.toLocaleString('ru-RU')}+`, label: "созданных материалов" },
            { to: 2, fmt: (v: number) => `~${v} мин`, label: "среднее время генерации" },
            { to: 48, fmt: (v: number) => `${v} ч/мес`, label: "экономия времени" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "22px 32px", textAlign: "center", borderRight: i < 3 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: "#1a120c" }}>
                <CountUp to={s.to} fmt={s.fmt} />
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 2, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ── */}
      <section style={{ padding: "72px 32px", background: "#f8f8f6" }}>
        <Reveal style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div className="preview-shell" style={{ borderRadius: 22, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #e8e8e8" }}>
            <div style={{ background: "#f0f0ee", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #e4e4e4" }}>
              <div style={{ display: "flex", gap: 5 }}>
                {["#ff5f57","#febc2e","#28c840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
              </div>
              <div style={{ flex: 1, background: "white", borderRadius: 6, padding: "3px 10px", fontSize: 11, color: "#aaa", textAlign: "center", maxWidth: 280, margin: "0 auto" }}>prepodavai.ru/dashboard</div>
            </div>
            <div style={{ background: "white", display: "flex", minHeight: 360 }}>
              <div style={{ width: 168, background: "#fafaf8", borderRight: "1px solid #f0f0f0", padding: "16px 12px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 22, paddingLeft: 4 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "#f97316" }} />
                  <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: "-0.02em" }}>Преподавай</span>
                </div>
                {[{ i: "🏠", l: "Главная", a: true },{ i: "✨", l: "Генератор" },{ i: "📁", l: "Материалы" },{ i: "👥", l: "Ученики" },{ i: "📈", l: "Аналитика" },{ i: "⚙️", l: "Настройки" }].map((x, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, fontSize: 11.5, color: x.a ? "#ea580c" : "#aaa", background: x.a ? "#fff3e8" : "transparent", fontWeight: x.a ? 700 : 400, marginBottom: 2 }}>
                    <span>{x.i}</span><span>{x.l}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, padding: "18px 22px", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <div>
                    <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 2px", letterSpacing: "-0.02em" }}>Создать материал</h2>
                    <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>Генерация с помощью ИИ</p>
                  </div>
                  <div style={{ background: "#f97316", color: "white", padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700 }}>+ Создать</div>
                </div>
                <div style={{ background: "#fafaf8", borderRadius: 12, border: "1px solid #eee", padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "#bbb", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Тема урока</div>
                  <div style={{ padding: "8px 12px", border: "1.5px solid #ea580c", borderRadius: 9, fontSize: 12, color: "#333", background: "white", marginBottom: 10 }}>
                    Фотосинтез — 6 класс
                    <span style={{ display: "inline-block", width: 1.5, height: 12, background: "#ea580c", marginLeft: 2, verticalAlign: "middle", animation: "caretBlink 1.1s infinite" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Рабочий лист","Тест","План урока","Презентация"].map((l, i) => (
                      <span key={i} style={{ padding: "5px 10px", borderRadius: 7, fontSize: 10, fontWeight: 600, background: i === 0 ? "#f97316" : "#f0f0f0", color: i === 0 ? "white" : "#888" }}>{l}</span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["17","Материалов"],["564","Генераций"],["1 250","Токенов"],["48ч","Сэкономлено"]].map(([v,lb],j) => (
                    <div key={j} style={{ flex: 1, background: "#fafaf8", border: "1px solid #f0f0f0", borderRadius: 10, padding: "10px 12px" }}>
                      <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: "-0.02em" }}>{v}</div>
                      <div style={{ fontSize: 9.5, color: "#bbb", marginTop: 1 }}>{lb}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── КАК ЭТО РАБОТАЕТ ── */}
      <section style={{ background: "white", padding: "72px 32px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 52 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Как это работает</p>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, margin: 0 }}>
              Три шага до готового материала
            </h2>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, position: "relative" }}>
            <div style={{ position: "absolute", top: 28, left: "18%", right: "18%", height: 1, background: "linear-gradient(90deg, #f97316, #f59e0b)", opacity: 0.3, zIndex: 0 }} />
            {steps.map((s, i) => (
              <Reveal key={i} delay={i * 150} style={{ position: "relative", zIndex: 1 }}>
                <div className="step-wrap" style={{ padding: "0 20px", textAlign: "center" }}>
                  <div className="step-icon" style={{ width: 56, height: 56, borderRadius: 16, background: i === 0 ? "#f97316" : "white", border: i === 0 ? "none" : "2px solid #e8e8e8", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: i === 0 ? "0 6px 20px rgba(249,115,22,0.25)" : "none" }}>
                    <span style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? "white" : "#ccc" }}>{s.n}</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>{s.title}</h3>
                  <p style={{ fontSize: 13.5, color: "#888", lineHeight: 1.65, margin: 0 }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── КАРУСЕЛЬ: ЧТО СОЗДАЛИ ── */}
      <section style={{ background: DARK, padding: "72px 0" }}>
        <Reveal style={{ textAlign: "center", marginBottom: 40, padding: "0 32px" }}>
          <h2 style={{ color: "white", fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 10 }}>
            Что уже создали учителя
          </h2>
          <p style={{ color: "#555", fontSize: 14, margin: 0 }}>
            Более 200 000 готовых материалов за последние месяцы
          </p>
        </Reveal>
        {/* overflow hidden with fade edges */}
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right, ${DARK}, transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to left, ${DARK}, transparent)`, zIndex: 2, pointerEvents: "none" }} />
          <div
            ref={carouselRef}
            style={{ display: "flex", gap: 20, overflowX: "hidden", padding: "12px 80px 16px", userSelect: "none" }}
          >
            {allItems.map((item, i) => (
              <div key={i} className="carousel-card" style={{ flexShrink: 0, width: 300, height: 400, borderRadius: 20, overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column" }}>
                {/* type badge row */}
                <div style={{ background: "rgba(15,15,26,0.7)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", backdropFilter: "blur(8px)", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "white", background: "rgba(255,255,255,0.13)", padding: "4px 10px", borderRadius: 7, letterSpacing: "0.01em" }}>{item.type}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>{item.grade}</span>
                </div>
                <div style={{ background: item.bg, flex: 1, overflow: "hidden" }}>
                  {item.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ИНСТРУМЕНТЫ — светлые карточки ── */}
      <section style={{ background: "#f8f8f6", padding: "72px 32px" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 48 }}>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: 10 }}>
              Всё необходимое — в одном месте
            </h2>
            <p style={{ color: "#888", fontSize: 15, maxWidth: 440, margin: "0 auto" }}>
              12+ инструментов для подготовки к урокам, оценки работ и коммуникации
            </p>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {tools.map((t, i) => (
              <Reveal key={i} delay={(i % 3) * 100 + Math.floor(i / 3) * 80}>
                <div className="tool-card" style={{ background: "white", borderRadius: 16, padding: "22px 24px", border: "1px solid #ebebeb", display: "flex", gap: 14, alignItems: "flex-start", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", height: "100%", boxSizing: "border-box" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${t.accent}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, border: `1px solid ${t.accent}22` }}>
                    {t.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a120c", marginBottom: 4 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: "#999", lineHeight: 1.55 }}>{t.desc}</div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── ПЕРСОНАЛИЗАЦИЯ ── */}
      <section style={{ background: "white", padding: "72px 32px" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72, alignItems: "center" }}>
          <Reveal>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#f97316", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>Персонализация</p>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.12, marginBottom: 18, color: "#1a120c" }}>
              Каждый ученик получает материал под свой уровень
            </h2>
            <p style={{ fontSize: 15, color: "#888", lineHeight: 1.75, marginBottom: 28 }}>
              Один запрос — три версии сложности. Начальный, средний, продвинутый. Не нужно переделывать вручную.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
              {["Адаптация под программу и класс","Согласованность с ФГОС","Сохранение в PDF, DOCX, Google Docs"].map((f, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff3e8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: "#f97316" }}>✓</span>
                  </div>
                  <span style={{ fontSize: 13.5, color: "#555" }}>{f}</span>
                </div>
              ))}
            </div>
            <button className="btn-cta" onClick={openRegister} style={{ padding: "12px 26px", background: "#f97316", color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(249,115,22,0.22)" }}>
              Попробовать
            </button>
          </Reveal>
          <Reveal delay={150} style={{ position: "relative", height: 280 }}>
            <div
              onMouseEnter={() => setStackHover(true)}
              onMouseLeave={() => setStackHover(false)}
              style={{ position: "absolute", inset: 0 }}
            >
            {[
              { top: 20, left: 12, rotate: -3, hoverRotate: -7, label: "Начальный уровень", sub: "Простые формулировки, подсказки", color: "#7c3aed" },
              { top: 10, left: 6, rotate: -1, hoverRotate: -2.5, label: "Средний уровень", sub: "Стандартные задания", color: "#0891b2" },
              { top: 0, left: 0, rotate: 0, hoverRotate: 2.5, label: "Продвинутый уровень", sub: "Расширенные задачи, без подсказок", color: "#f97316" },
            ].map((c, i) => (
              <div key={i} style={{ position: "absolute", top: c.top, left: c.left, right: -c.left, bottom: 0, transform: `rotate(${stackHover ? c.hoverRotate : c.rotate}deg) translateY(${stackHover ? -6 : 0}px)`, transformOrigin: "bottom center", background: "white", borderRadius: 16, border: "1px solid #ebebeb", padding: "20px 22px", boxShadow: stackHover ? "0 12px 36px rgba(0,0,0,0.12)" : "0 4px 20px rgba(0,0,0,0.07)", transition: "transform .4s cubic-bezier(.22,1,.36,1), box-shadow .4s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 14 }}>{c.sub}</div>
                <div style={{ height: 8, borderRadius: 4, background: "#f0f0f0", marginBottom: 6, width: "85%" }} />
                <div style={{ height: 8, borderRadius: 4, background: "#f0f0f0", marginBottom: 6, width: "65%" }} />
                <div style={{ height: 8, borderRadius: 4, background: "#f0f0f0", width: "75%" }} />
              </div>
            ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── ОТЗЫВЫ ── */}
      <section style={{ background: "#f8f8f6", padding: "72px 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <Reveal>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 40px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 40, textAlign: "center" }}>
              Говорят учителя
            </h2>
          </Reveal>
          <Reveal delay={100} style={{ background: DARK, borderRadius: 20, padding: "36px 40px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -20, right: -10, fontSize: 120, opacity: 0.05, lineHeight: 1, fontFamily: "Georgia, serif", color: "white" }}>"</div>
            <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.9)", lineHeight: 1.7, margin: "0 0 22px", fontStyle: "italic", maxWidth: 680, position: "relative" }}>
              &ldquo;{testimonials[0].text}&rdquo;
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: testimonials[0].color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white" }}>{testimonials[0].initials}</div>
              <div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 14 }}>{testimonials[0].name}</div>
                <div style={{ color: "#555", fontSize: 12 }}>{testimonials[0].role}</div>
              </div>
            </div>
          </Reveal>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {testimonials.slice(1).map((t, i) => (
              <Reveal key={i} delay={200 + i * 120}>
                <div className="testi-card" style={{ padding: "24px 26px", borderRadius: 16, border: "1px solid #ebebeb", background: "white", height: "100%", boxSizing: "border-box" }}>
                <p style={{ fontSize: 14, color: "#555", lineHeight: 1.65, margin: "0 0 18px", fontStyle: "italic" }}>&ldquo;{t.text}&rdquo;</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white" }}>{t.initials}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#bbb" }}>{t.role}</div>
                  </div>
                </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: DARK, padding: "80px 32px" }}>
        <Reveal style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ color: "white", fontSize: "clamp(28px, 4vw, 50px)", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.05, marginBottom: 16 }}>
            Начните готовить уроки
            <br />
            <span style={{ background: "linear-gradient(95deg, #f97316, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>в 10 раз быстрее</span>
          </h2>
          <p style={{ color: "#555", fontSize: 15, marginBottom: 36, lineHeight: 1.65 }}>
            Первые 7 дней бесплатно. Без привязки карты. Отменить можно в любой момент.
          </p>
          <button className="btn-cta" onClick={openRegister} style={{ padding: "15px 36px", background: "#f97316", color: "white", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 28px rgba(249,115,22,0.35)" }}>
            Попробовать бесплатно
          </button>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ padding: "24px 32px", background: DARK_DEEP, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#444" }}>
          <span>© 2025 Преподавай</span>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {([["Оферта","/legal/offer"],["Условия","/legal/terms"],["Конфиденциальность","/legal/privacy"],["Обработка ПД","/legal/consent/processing"],["Рассылка","/legal/consent/mailing"]] as [string,string][]).map(([label,href]) => (
              <Link key={href} href={href} style={{ color: "inherit", textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
        </div>
      </footer>

      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={handleAuthSuccess} initialMode={authMode} />
      )}
    </div>
  );
}
