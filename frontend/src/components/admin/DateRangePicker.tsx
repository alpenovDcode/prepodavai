'use client'

interface DateRangePickerProps {
  value: string         // '7d' | '30d' | '90d' | '180d'
  onChange: (v: string) => void
  options?: { label: string; value: string }[]
  className?: string
}

const DEFAULT_OPTIONS = [
  { label: '7 дней',   value: '7d' },
  { label: '30 дней',  value: '30d' },
  { label: '90 дней',  value: '90d' },
  { label: '180 дней', value: '180d' },
]

export function daysFromRange(range: string): number {
  return parseInt(range.replace('d', '')) || 30
}

export default function DateRangePicker({ value, onChange, options, className = '' }: DateRangePickerProps) {
  const opts = options ?? DEFAULT_OPTIONS
  return (
    <div className={`inline-flex bg-gray-100 rounded-xl p-1 gap-1 ${className}`}>
      {opts.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            value === opt.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
