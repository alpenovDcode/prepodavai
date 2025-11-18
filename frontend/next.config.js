/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Для Docker
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_TELEGRAM_BOT_NAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME,
  },
}

module.exports = nextConfig

