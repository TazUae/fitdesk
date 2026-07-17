/**
 * Payment rails & settlement metadata — Slice 1 foundation.
 *
 * A "rail" is the family a payment method belongs to (cash, mobile wallet,
 * bank transfer, digital asset). The "settlement asset" is what the trainer
 * actually receives. Both are DISPLAY / grouping metadata — never a method
 * identity. Method IDs (see lib/payments/methods.ts) stay stable; e.g. `cash`
 * is never renamed to `cash_fresh_usd`. "Fresh USD" is settlement context, not
 * an id.
 *
 * Slice 1 only needs the type surface + a small mapping for the three existing
 * methods so the availability preflight can reason about currency/settlement
 * compatibility. The full product catalog (OMT, MyMonty, Suyool, Purpl, USDT,
 * Bank Transfer, …) lands in Slice 2 (plan §4.2).
 */

export type PaymentRail = 'cash' | 'mobile_wallet' | 'bank_transfer' | 'digital_asset'

/** Settlement asset the trainer actually receives. */
export type SettlementAsset = 'USD' | 'USDT' | 'LBP' | 'OTHER'

/** Display/settlement nuance (e.g. cash-note quality). Metadata, NOT identity. */
export type SettlementContext = 'fresh_usd' | null
