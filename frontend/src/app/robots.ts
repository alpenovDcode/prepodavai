import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/admin/', '/workspace/', '/api/'],
    },
    sitemap: 'https://prepodavai.ru/sitemap.xml',
  }
}
