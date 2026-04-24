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
            <span
              key={hour}
              className="absolute right-3 text-[11px] font-medium uppercase tracking-[0.08em]"
              style={{
                top: idx * HOUR_HEIGHT_PX - 6,
                color: 'rgba(175,184,210,0.62)',
              }}
            >
              {formatHour(hour)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" style={{ height: GRID_TOTAL_HEIGHT }}>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-px"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.14) 100%)',
            }}
          />
          {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }).map((_, idx) => (
            <div
              key={idx}
              className="absolute left-0 right-0"
              style={{
                top: idx * HOUR_HEIGHT_PX,
                height: 1,
                background:
                  idx % 2 === 0
                    ? 'rgba(255,255,255,0.055)'
                    : 'repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0, rgba(255,255,255,0.035) 4px, transparent 4px, transparent 12px)',
              }}
            />
          ))}
          <div className="absolute inset-0">{children}</div>
        </div>
      </div>
    </div>
  )
}
