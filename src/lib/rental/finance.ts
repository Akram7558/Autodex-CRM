// ─────────────────────────────────────────────────────────────────────
// Rental finance — single pure helper for the contract money math.
// ─────────────────────────────────────────────────────────────────────
// One source of truth, reused by:
//   • ContractDetail PaymentsSection (the fiche finance panel)
//   • GET /api/rental/rentals/[id]/pickup (settlement summary + gate)
//   • the expandable contract row in RentalContractsList (Chantier 2 step 2)
//
// Categories (mirrors src/lib/rental/payments.ts):
//   • LOYER   → type 'rental_payment'                     (counts vs the total)
//   • CAUTION → 'deposit' (perçue) / 'refund' (rendue)    (held money, not revenue)
//   • FRAIS   → extra_charge / km_excess / late_fee /
//               damage_fee / fuel_charge                   (additional revenue)
//
// Pure — no React, no I/O. Numerics may arrive as Supabase strings → toNum.
// ─────────────────────────────────────────────────────────────────────

import { toNum } from '@/components/rental/booking/types'
import { isExtraFeeType } from '@/lib/rental/payments'

export type FinancePayment = { type: string; amount: number | string | null }

export type RentalFinance = {
  totalLoyer:      number
  payeLoyer:       number
  resteLoyer:      number
  totalFrais:      number
  cautionAttendue: number
  cautionPercue:   number
  cautionRendue:   number
  cautionRestante: number
}

export function computeRentalFinance(input: {
  total:    number | string | null
  deposit:  number | string | null
  payments: FinancePayment[]
}): RentalFinance {
  const totalLoyer      = toNum(input.total)
  const cautionAttendue = toNum(input.deposit)

  let payeLoyer = 0
  let totalFrais = 0
  let cautionPercue = 0
  let cautionRendue = 0
  for (const p of input.payments ?? []) {
    const a = toNum(p.amount)
    if (p.type === 'rental_payment')      payeLoyer += a
    else if (p.type === 'deposit')        cautionPercue += a
    else if (p.type === 'refund')         cautionRendue += a
    else if (isExtraFeeType(p.type))      totalFrais += a
  }

  const resteLoyer      = Math.max(0, totalLoyer - payeLoyer)
  const cautionRestante = Math.max(0, cautionAttendue - (cautionPercue - cautionRendue))

  return {
    totalLoyer, payeLoyer, resteLoyer, totalFrais,
    cautionAttendue, cautionPercue, cautionRendue, cautionRestante,
  }
}
