import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin', 'cyrillic'] })

export const metadata: Metadata = {
  title: 'PrepodavAI - AI Tutor Copilot',
  description: 'Интеллектуальный помощник для преподавателей',
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
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Script id="suppress-logs" strategy="beforeInteractive">
          {`
            (function() {
              const originalLog = console.log;
              const originalInfo = console.info;
              const originalWarn = console.warn;
              
              function shouldSuppress(args) {
                const msg = args[0];
                return typeof msg === 'string' && (
                  msg.includes('[Telegram.WebView]') || 
                  msg.includes('Telegram WebApp')
                );
              }

              console.log = function(...args) {
                if (!shouldSuppress(args)) originalLog.apply(console, args);
              };
              console.info = function(...args) {
                if (!shouldSuppress(args)) originalInfo.apply(console, args);
              };
              // Не подавляем warn/error, если только пользователь не попросил
              // console.warn = function(...args) {
              //   if (!shouldSuppress(args)) originalWarn.apply(console, args);
              // };
            })();
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

