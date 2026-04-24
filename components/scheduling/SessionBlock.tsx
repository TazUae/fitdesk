'use client'

import { heightFromDuration, topFromStartTime } from '@/components/scheduling/TimeGrid'

interface SessionBlockProps {
  startTime: Date
  duration: number
  clientName: string
  color: string
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'NA'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

function hhmm(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${minutes} ${suffix}`
}

export function SessionBlock({ startTime, duration, clientName, color }: SessionBlockProps) {
  const top = topFromStartTime(startTime)
  const height = heightFromDuration(duration)
  const endTime = new Date(startTime.getTime() + duration * 60_000)

  return (
    <div
      className="absolute left-2.5 right-3.5 rounded-2xl border px-2.5 py-2 shadow-xl backdrop-blur-md"
      style={{
        top,
        height: Math.max(height, 56),
        borderColor: 'rgba(255,255,255,0.30)',
        background: color,
        boxShadow: '0 14px 30px rgba(7,10,20,0.36), inset 0 0 0 1px rgba(255,255,255,0.12)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold"
          style={{
            background: 'rgba(255,255,255,0.22)',
            borderColor: 'rgba(255,255,255,0.35)',
            color: 'rgba(255,255,255,0.95)',
            boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
          }}
        >
          {getInitials(clientName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold leading-tight text-white">{clientName}</p>
          <p className="mt-0.5 text-[10px] font-medium leading-tight text-white/85">
            {hhmm(startTime)} - {hhmm(endTime)}
          </p>
        </div>
      </div>
    </div>
  )
}
