'use client'

import { cn } from '@/lib/utils'

export type DayItem = {
  key: string
  label: string
  dateNumber: number
}

interface DaySelectorProps {
  days: DayItem[]
  selectedDayKey: string
  onSelect: (dayKey: string) => void
}

export function DaySelector({ days, selectedDayKey, onSelect }: DaySelectorProps) {
  return (
    <div
      className="mb-4 grid grid-cols-7 gap-1.5 rounded-2xl border p-1.5 backdrop-blur-xl sm:gap-2"
      style={{
        borderColor: 'rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      {days.map(day => {
        const isSelected = day.key === selectedDayKey
        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onSelect(day.key)}
            className={cn('rounded-xl px-1 py-2 text-center transition-all duration-200')}
            style={
              isSelected
                ? {
                    background: 'linear-gradient(180deg, rgba(102,176,255,0.98) 0%, rgba(74,136,255,0.95) 100%)',
                    boxShadow: '0 10px 20px rgba(52,112,255,0.38), inset 0 0 0 1px rgba(255,255,255,0.32)',
                  }
                : {
                    background: 'rgba(255,255,255,0.03)',
                  }
            }
            aria-pressed={isSelected}
          >
            <span
              className="block text-[11px] font-medium uppercase tracking-wide"
              style={{ color: isSelected ? 'rgba(10,18,38,0.85)' : 'var(--fd-muted)' }}
            >
              {day.label}
            </span>
            <span
              className="mt-0.5 block text-sm font-semibold"
              style={{ color: isSelected ? 'rgba(9,16,34,0.95)' : 'var(--fd-text)' }}
            >
              {day.dateNumber}
            </span>
          </button>
        )
      })}
    </div>
  )
}
