'use client'

import { useEffect, useState } from 'react'

/**
 * Current-time tick component.
 *
 * Schedule-X v4 renders its own current-time indicator (`.sx__time-grid-now-line`
 * / `.sx__current-time-indicator`); we restyle it red via
 * `scheduler-x-overrides.css`. This component exists purely to force a 60-s
 * re-render so the indicator stays accurate after a tab regains focus or after
 * long idle periods (Schedule-X's internal ticker can drift).
 *
 * Renders nothing visible. Mount once inside `SchedulerXAdapter`.
 */
export function NowLine() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), 60_000)
    const onFocus = () => setTick(t => t + 1)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [])

  return null
}
