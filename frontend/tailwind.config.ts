import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── Legacy primary (используется в текущих компонентах) ────────────
        // Оставляем как есть до завершения миграции.
        primary: {
          DEFAULT: '#FF7E58',
          dark: '#E06543',
          light: '#FF9E80',
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#FF7E58',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        sidebar: {
          bg: '#FFFFFF',
          hover: '#FFF7ED',
          active: '#FFEDD5',
        },
        course: {
          purple: '#A78BFA',
          orange: '#FB923C',
          blue: '#60A5FA',
          pink: '#F472B6',
          green: '#34D399',
          magenta: '#E879F9',
        },

        // ─── Redesign v2 ────────────────────────────────────────────────────
        // Brand · Преподавай coral (точные значения из мокапов).
        brand: {
          50:  'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
          DEFAULT: 'var(--brand-500)',
        },
        // Neutrals (slate scale для текста и фонов).
        ink: {
          50:  'var(--ink-50)',
          100: 'var(--ink-100)',
          200: 'var(--ink-200)',
          300: 'var(--ink-300)',
          400: 'var(--ink-400)',
          500: 'var(--ink-500)',
          600: 'var(--ink-600)',
          700: 'var(--ink-700)',
          800: 'var(--ink-800)',
          900: 'var(--ink-900)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          soft:    'var(--surface-soft)',
          sunken:  'var(--surface-sunken)',
        },
        // Семантические — для статусов и обратной связи.
        success: {
          50:  'var(--success-50)',
          500: 'var(--success-500)',
          700: 'var(--success-700)',
        },
        warning: {
          50:  'var(--warning-50)',
          500: 'var(--warning-500)',
          700: 'var(--warning-700)',
        },
        danger: {
          50:  'var(--danger-50)',
          500: 'var(--danger-500)',
          700: 'var(--danger-700)',
        },
        info: {
          50:  'var(--info-50)',
          500: 'var(--info-500)',
          700: 'var(--info-700)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'xs':  '6px',
        'sm':  '8px',
        DEFAULT: '12px',
        'md':  '12px',
        'lg':  '16px',
        'xl':  '20px',
        '2xl': '24px',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(15, 23, 42, 0.04)',
        'sm': '0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'md': '0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'lg': '0 12px 24px rgba(15, 23, 42, 0.10), 0 2px 4px rgba(15, 23, 42, 0.04)',
        'brand-glow': '0 4px 14px rgba(255, 126, 88, 0.30)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        'fast':   '120ms',
        'base':   '180ms',
        'medium': '260ms',
      },
      keyframes: {
        'msg-in': {
          'from': { opacity: '0', transform: 'translateY(6px)' },
          'to':   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          'from': { opacity: '0' },
          'to':   { opacity: '1' },
        },
      },
      animation: {
        'msg-in':  'msg-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
export default config
