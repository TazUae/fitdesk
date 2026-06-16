/**
 * fmtMoney — currency code prefix, up to 2 decimal places.
 * Used by invoice detail and invoice list views.
 * Output example: "USD 1,234.56"
 */
export function fmtMoney(n: number, currency = 'USD'): string {
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/**
 * fmtMoneyCompact — currency symbol, 0 decimal places, compact zero.
 * Used by dashboard summary panels where whole-number amounts are sufficient.
 * Output example: "$1,234" or "$0" for zero.
 */
export function fmtMoneyCompact(n: number, currency: string): string {
  if (n === 0) return '$0'
  return new Intl.NumberFormat('en-US', {
    style:                'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n)
}
