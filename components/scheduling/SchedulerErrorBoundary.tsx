'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches runtime errors from the Schedule-X adapter (or anything inside) and
 * renders the supplied fallback. Logs to console with a [scheduler-x] tag so
 * mount-time crashes surface in browser dev tools and staging telemetry.
 */
export class SchedulerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[scheduler-x] adapter crashed — rendering fallback', error, info)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}
