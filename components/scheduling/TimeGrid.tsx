'use client'

import type { ReactNode } from 'react'

export const GRID_START_HOUR = 6
export const GRID_END_HOUR = 21
/** One hour row height — tuned to reference (~80px feel at mobile scale). */
export const HOUR_HEIGHT_PX = 72
export const GRID_TOTAL_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT_PX

function formatHour(hour24: number): string {
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12} ${suffix}`
}

export function minutesFromGridStart(date: Date): number {
  return (date.getHours() - GRID_START_HOUR) * 60 + date.getMinutes()
}

export function topFromStartTime(date: Date): number {
  const minutes = minutesFromGridStart(date)
  const clampedMinutes = Math.max(0, Math.min((GRID_END_HOUR - GRID_START_HOUR) * 60, minutes))
  return (clampedMinutes / 60) * HOUR_HEIGHT_PX
}

export function heightFromDuration(durationMinutes: number): number {
  return Math.max(52, (durationMinutes / 60) * HOUR_HEIGHT_PX)
}

interface TimeGridProps {
  children: ReactNode
}

export function TimeGrid({ children }: TimeGridProps) {
  const hourSlots = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR + 1 },
    (_, i) => GRID_START_HOUR + i,
  )

  return (
    <div
      className="relative overflow-hidden rounded-2xl border backdrop-blur-xl"
      style={{
        borderColor: 'rgba(255,255,255,0.12)',
        background: 'linear-gradient(180deg, rgba(21,26,39,0.78) 0%, rgba(11,14,24,0.82) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex">
        <div
          className="relative shrink-0 border-r px-2"
          style={{
            width: 72,
            height: GRID_TOTAL_HEIGHT,
            borderColor: 'rgba(255,255,255,0.12)',
            background: 'linear-gradient(180deg, rgba(8,11,19,0.5) 0%, rgba(8,11,19,0.35) 100%)',
          }}
        >
          {hourSlots.map((hour, idx) => (
            <div
              key={hour}
              className="absolute right-2 text-[11px] font-medium"
              style={{
                top: idx * HOUR_HEIGHT_PX - 8,
                color: 'rgba(255,255,255,0.38)',
                lineHeight: 1,
              }}
            >
              {formatHour(hour)}
            </div>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: GRID_TOTAL_HEIGHT }}>
          {hourSlots.map((hour, idx) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t"
              style={{
                top: idx * HOUR_HEIGHT_PX,
                borderColor: idx === 0 ? 'transparent' : 'rgba(255,255,255,0.07)',
              }}
            />
          ))}
          {children}
        </div>
      </div>
    </div>
  )
}
