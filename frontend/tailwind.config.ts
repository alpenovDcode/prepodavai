import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF7E58',
          dark: '#E06543',
          light: '#FF9E80',
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#FF7E58', // Main brand color
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
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
export default config

