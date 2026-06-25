const MARKERS = [
  'Not Configured',
  'FITDESK_JWT_SECRET',
  'CONTROL_PLANE_URL',
  'Control Plane',
  'No Tenant',
]

export function isErpUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return MARKERS.some(m => msg.includes(m))
}
