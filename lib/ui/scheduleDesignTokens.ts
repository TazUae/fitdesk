/**
 * Shared visual tokens for the FitDesk scheduling surface (v3 light theme).
 *
 * Phase 5.0 — Google Calendar–inspired Planner. All values are also exposed as
 * CSS variables in app/globals.css (`--fd-*`); these constants mirror them for
 * use inside inline `style` objects that can't read CSS vars conveniently.
 */

export const scheduleTokens = {
  // Radius
  radiusSm:  '0.375rem',   // 6 px — event cards
  radiusMd:  '0.5rem',     // 8 px — buttons, inputs
  radiusLg:  '0.75rem',    // 12 px — cards
  radiusXl:  '1rem',       // 16 px — sheets

  // Borders
  borderSubtle: '#E8EAED',
  borderStrong: '#DADCE0',

  // Surfaces
  surface:      '#FFFFFF',
  appBg:        '#F8F9FA',
  cardHover:    '#F1F3F4',

  // Text
  text:         '#3C4043',
  textMuted:    '#70757A',
  textOnPrimary:'#FFFFFF',

  // Primary action (Google blue)
  actionPrimary:        '#1A73E8',
  actionPrimaryHover:   '#1765CC',
  actionPrimarySubtle:  '#E8F0FE',

  // Brand accent (gold — wordmark only, never a CTA)
  brandAccent:  '#E8C547',

  // Status semantics
  statusSuccess: '#188038',
  statusWarning: '#E37400',
  statusDanger:  '#D93025',

  // Pastel event-card palette — paired with text color for contrast
  pastels: {
    blue:   { fill: '#D2E3FC', text: '#174EA6' },
    green:  { fill: '#CEEAD6', text: '#0D652D' },
    yellow: { fill: '#FEEFC3', text: '#7E6101' },
    purple: { fill: '#E7D9FF', text: '#4A148C' },
    pink:   { fill: '#FAD2CF', text: '#A50E0E' },
    teal:   { fill: '#CBF0F8', text: '#007B83' },
    gray:   { fill: '#E8EAED', text: '#3C4043' },
  },

  // Shadows — subtle Material-style elevations
  shadowCard:     '0 1px 2px rgba(60,64,67,0.08), 0 1px 3px rgba(60,64,67,0.12)',
  shadowElevated: '0 2px 6px rgba(60,64,67,0.10), 0 4px 12px rgba(60,64,67,0.15)',
  shadowFab:      '0 4px 8px rgba(60,64,67,0.15), 0 2px 4px rgba(60,64,67,0.10)',

  // Spacing
  spaceSection: '1rem',

  // Calendar grid
  slotHeightPx:        48,
  slotHeightMobilePx:  56,
  dayHeaderHeightPx:   56,
  todayCirclePx:       32,
} as const

export type ScheduleTokens = typeof scheduleTokens
export type PastelKey = keyof typeof scheduleTokens.pastels
