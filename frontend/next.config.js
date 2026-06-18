/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Для Docker
  experimental: {
    externalDir: true,
    optimizePackageImports: ['lucide-react', '@tiptap/core', '@tiptap/react', 'jspdf', 'html2canvas', 'pptxgenjs'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_TELEGRAM_BOT_NAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME,
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        child_process: false,
        tls: false,
        net: false,
      };

      // Fix for "node:" imports in client-side bundles
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
    }
    return config;
  },
  async redirects() {
    return [
      {
        source: '/privacy-policy',
        destination: '/legal/privacy',
        permanent: true,
      },
      {
        source: '/public-offer',
        destination: '/legal/offer',
        permanent: true,
      },
      {
        source: '/personal-data',
        destination: '/legal/consent/processing',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    // Umnnye ssylki: prepodavai.ru/g/<slug> — публичный редирект, который
    // обрабатывает БЭК (SmartLinksRedirectController). Next.js сам по себе
    // эту страницу не знает (нет /g/[slug]/page.tsx), поэтому проксируем
    // на API-сервер. Бэк отвечает 302 → браузер уходит на t.me/?start=...
    // или на лендинг с UTM-параметрами.
    //
    // У бэка global prefix 'api' (main.ts), поэтому реальный путь — /api/g/...
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    return [
      {
        source: '/g/:slug*',
        destination: `${apiBase}/api/g/:slug*`,
      },
    ]
  },
}

module.exports = nextConfig

