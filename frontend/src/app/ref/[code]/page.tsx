'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function ReferralRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const code = params.code as string

  useEffect(() => {
    if (code) {
      // Сохраняем реферальный код в localStorage для применения после регистрации
      localStorage.setItem('prepodavai_referral_code', code)
    }

    // Редирект на главную (регистрацию/логин)
    router.replace('/')
  }, [code, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB]">
      <Loader2 className="w-10 h-10 animate-spin text-primary-600 mb-4" />
      <p className="text-gray-600 text-sm">Перенаправление...</p>
    </div>
  )
}
