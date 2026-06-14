export type TourStep =
  | { target: null; isModal: true; illustration?: string; title: string; body: string; primaryLabel?: string }
  | { target: string; placement?: 'top' | 'right' | 'bottom' | 'left'; padding?: number; title: string; body: string; primaryLabel?: string }

export type TourConfig = {
  storageKey: string
  autostart?: boolean
  steps: TourStep[]
}
