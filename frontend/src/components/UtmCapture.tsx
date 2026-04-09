'use client'

import { useEffect } from 'react'
import { captureUtm } from '@/lib/utils/utm'

/** Монтируется один раз в корневом layout, читает UTM из URL и сохраняет в localStorage */
export default function UtmCapture() {
  useEffect(() => {
    captureUtm()
  }, [])
  return null
}
