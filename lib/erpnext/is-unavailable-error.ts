const MARKERS = [
  'Not Configured',
  'ERPNEXT_BASE_URL',
  'ERPNEXT_API_KEY',
  'ERPNEXT_API_SECRET',
  'CONTROL_PLANE_URL',
  'No Tenant',
]

export function isErpUnavailableError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return MARKERS.some(m => msg.includes(m))
}
