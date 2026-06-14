'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import MaintenanceGate from '@/components/MaintenanceGate'
import { AnalyticsProvider } from '@/components/AnalyticsProvider'
import { TourProvider } from '@/lib/tour/TourContext'
import { TourOverlay } from '@/lib/tour/TourOverlay'
// import FloatingBalance from '@/components/workspace/FloatingBalance'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {/* Suspense нужен из-за useSearchParams внутри AnalyticsProvider —
          в Next.js 14 этот хук требует Suspense-границы. */}
      <Suspense fallback={null}>
        <AnalyticsProvider>
          <TourProvider>
            <MaintenanceGate>{children}</MaintenanceGate>
            <TourOverlay />
          </TourProvider>
        </AnalyticsProvider>
      </Suspense>
      {/* <FloatingBalance /> */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
          },
        }}
      />
    </QueryClientProvider>
  )
}
