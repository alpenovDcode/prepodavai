import type { Metadata } from 'next'
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import Script from 'next/script'
import UtmCapture from '@/components/UtmCapture'
import YandexMetrika from '@/components/YandexMetrika'

// Inter — body шрифт (используется и в legacy, и в v2).
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-sans-var',
})
// Plus Jakarta Sans — headings в redesign v2.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-display-var',
})
// JetBrains Mono — для табличных цифр и моноширинного текста.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  display: 'swap',
  variable: '--font-mono-var',
})

export const metadata: Metadata = {
  title: 'Преподавай',
  description: 'Интеллектуальный помощник для преподавателей',
  icons: {
    icon: '/logo-prepodavai.png',
    apple: '/logo-prepodavai.png',
  },
  verification: {
    google: '1e0a6091207ead1d',
    yandex: '466cf3a9e0954abb',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru">
      <head>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" rel="stylesheet" />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <Script src="https://st.max.ru/js/max-web-app.js" strategy="afterInteractive" />
        <Script id="webapp-ready-poller" strategy="afterInteractive">
          {`
            (function() {
              var called = false;
              function callReady() {
                if (called) return;
                try {
                  if (window.WebApp && typeof window.WebApp.ready === 'function') {
                    window.WebApp.ready();
                    called = true;
                  }
                  if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.ready === 'function') {
                    window.Telegram.WebApp.ready();
                  }
                } catch(e) {}
              }
              // Пробуем сразу
              callReady();
              // Polling каждые 100мс пока SDK не загрузится (макс 5 сек)
              var attempts = 0;
              var interval = setInterval(function() {
                callReady();
                if (called || ++attempts >= 50) clearInterval(interval);
              }, 100);
            })();
          `}
        </Script>
        <Script id="suppress-logs" strategy="beforeInteractive">
          {`
            (function() {
              const originalLog = console.log;
              const originalInfo = console.info;
              const originalWarn = console.warn;
              const originalError = console.error;

              function shouldSuppress(args) {
                const msg = String(args[0] || '');
                return (
                  msg.includes('[Telegram.WebView]') ||
                  msg.includes('Telegram WebApp') ||
                  msg.includes('Max WebApp') ||
                  msg.includes('[WebApp]') ||
                  msg.includes('WebAppReady') ||
                  msg.includes('WebApp готово к работе') ||
                  msg.includes('max-web-app') ||
                  msg.includes('telegram-web-app')
                );
              }

              console.log = function(...args) {
                if (!shouldSuppress(args)) originalLog.apply(console, args);
              };
              console.info = function(...args) {
                if (!shouldSuppress(args)) originalInfo.apply(console, args);
              };
              console.warn = function(...args) {
                if (!shouldSuppress(args)) originalWarn.apply(console, args);
              };
            })();
          `}
        </Script>
      </head>
      <body className={`${inter.className} ${jakarta.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
        <UtmCapture />
        <YandexMetrika />
      </body>
    </html>
  )
}

