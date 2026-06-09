import {
  getAccounts,
  getContracts,
  getContract,
  getJournalEntries,
  getTransactions,
  saveTransaction,
  saveJournalEntries,
  saveDeposit,
  getDepositByContract,
  getDeposits,
} from '../lib/db.js'

// ── Find account by code ──────────────────────────────────
export async function getAccountByCode(code, accounts = null) {
  const accts = accounts || await getAccounts()
  return accts.find(a => a.code === code) || null
}

// ── Post a balanced double-entry transaction ──────────────
// entries: [{ accountCode, debit, credit, description }]
export async function postTransaction({ date, description, type, contractId, invoiceId, entries }) {
  const totalDebits  = entries.reduce((s, e) => s + (Number(e.debit)  || 0), 0)
  const totalCredits = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0)

  const diff = Math.abs(totalDebits - totalCredits)
  if (diff > 0.01) {
    throw new Error(
      `Transaction déséquilibrée: débits=${totalDebits.toFixed(2)} ≠ crédits=${totalCredits.toFixed(2)}`
    )
  }

  const tx = await saveTransaction({
    date: date || new Date().toISOString().slice(0, 10),
    description,
    type: type || 'manual',
    contractId: contractId || null,
    invoiceId:  invoiceId  || null,
    totalAmount: totalDebits,
  })

  const accts = await getAccounts()
  const journalLines = entries.map(e => ({
    transactionId: tx.id,
    transactionRef: tx.reference,
    date: tx.date,
    accountCode: e.accountCode,
    accountName: accts.find(a => a.code === e.accountCode)?.name || e.accountCode,
    description: e.description || description,
    debit:  Number(e.debit)  || 0,
    credit: Number(e.credit) || 0,
  }))

  await saveJournalEntries(journalLines)
  return tx
}

// ── Generate rental invoice journal entries ───────────────
// The DB schema only has `total_amount` (→ totalTTC) and lumped `extra_fees`
// — no separate totalHT / tva / extraKmFee / fuelFee / damageFee columns.
// We derive HT and TVA at the Moroccan rate (20%) from TTC when the
// contract doesn't carry the values explicitly. Anything in extra_fees is
// treated as a restitution fee and credited to 3020.
const MOROCCO_TVA_RATE = 0.20

export async function generateRentalInvoice(contractId) {
  const contract = await getContract(contractId)
  if (!contract) throw new Error('Contrat introuvable')

  let totalTTC = Number(contract.totalTTC ?? contract.total_amount ?? 0)
  let totalHT  = Number(contract.totalHT  ?? contract.total_ht     ?? 0)
  let tva      = Number(contract.tva       ?? 0)

  // Fill in whichever pieces the contract is missing using the 20% rate.
  if (totalTTC <= 0 && totalHT > 0) {
    tva      = tva || totalHT * MOROCCO_TVA_RATE
    totalTTC = totalHT + tva
  } else if (totalTTC > 0 && totalHT <= 0) {
    totalHT = totalTTC / (1 + MOROCCO_TVA_RATE)
    tva     = tva || (totalTTC - totalHT)
  } else if (totalTTC > 0 && totalHT > 0 && tva <= 0) {
    tva = totalTTC - totalHT
  }

  if (totalTTC <= 0) {
    throw new Error(`Contrat ${contract.contractNumber || contractId} sans montant — facture non émise`)
  }

  // Web split fields (extraKmFee / fuelFee / damageFee) if present, else
  // fall back to lumped `extra_fees` from the DB.
  const extraKmFee     = Number(contract.extraKmFee  ?? 0)
  const fuelFee        = Number(contract.fuelFee     ?? 0)
  const damageFee      = Number(contract.damageFee   ?? 0)
  const lumpedExtras   = Number(contract.extra_fees  ?? contract.extraFees ?? 0)
  const restitutionFee = (extraKmFee + fuelFee + damageFee) > 0
    ? fuelFee + damageFee
    : lumpedExtras

  const baseCA = Math.max(0, totalHT - extraKmFee - restitutionFee)

  const entries = []

  // Debit 1100 — Créances clients (full TTC)
  entries.push({ accountCode: '1100', debit: totalTTC, credit: 0, description: `Créance — ${contract.clientName || ''}` })

  // Credit 3000 — CA Location (base HT)
  if (baseCA > 0) {
    entries.push({ accountCode: '3000', debit: 0, credit: baseCA, description: `CA Location — ${contract.contractNumber || ''}` })
  }

  // Credit 3030 — Extra KM (only if split-fees shape was used)
  if (extraKmFee > 0) {
    entries.push({ accountCode: '3030', debit: 0, credit: extraKmFee, description: 'Frais km supplémentaires' })
  }

  // Credit 3020 — Restitution fees (split fuel+damage, or the lumped extras)
  if (restitutionFee > 0) {
    entries.push({ accountCode: '3020', debit: 0, credit: restitutionFee, description: 'Frais de restitution' })
  }

  // Credit 2100 — TVA
  if (tva > 0) {
    entries.push({ accountCode: '2100', debit: 0, credit: tva, description: 'TVA collectée 20%' })
  }

  return postTransaction({
    date: contract.endDate || contract.return_date || contract.actual_return_date || new Date().toISOString().slice(0, 10),
    description: `Facture location — ${contract.contractNumber || ''} — ${contract.clientName || ''}`,
    type: 'invoice',
    contractId,
    entries,
  })
}

// ── Hold a security deposit ───────────────────────────────
export async function holdDeposit({ contractId, clientName, vehicleName, amount, date }) {
  const amt = Number(amount)
  const tx = await postTransaction({
    date: date || new Date().toISOString().slice(0, 10),
    description: `Dépôt de garantie — ${clientName} — ${vehicleName}`,
    type: 'deposit_hold',
    contractId,
    entries: [
      { accountCode: '1200', debit: amt, credit: 0, description: 'Dépôt à recevoir' },
      { accountCode: '2000', debit: 0, credit: amt, description: 'Dépôt client' },
    ],
  })

  return saveDeposit({
    id: (typeof crypto !== 'undefined' ? crypto.randomUUID() : Date.now().toString(36)),
    contractId,
    clientName,
    vehicleName,
    amount: amt,
    status: 'held',
    heldAt: date || new Date().toISOString().slice(0, 10),
    deductions: [],
    releasedAmount: 0,
    transactionId: tx.id,
  })
}

// ── Release a security deposit (partial or full) ──────────
// deductions: [{ reason: string, amount: number, accountCode: string }]
export async function releaseDeposit({ depositId, deductions = [] }) {
  const deposits = await getDeposits()
  const deposit = deposits.find(d => d.id === depositId)
  if (!deposit) throw new Error('Dépôt introuvable')

  const totalDeductions = deductions.reduce((s, d) => s + Number(d.amount), 0)
  const refundAmount    = deposit.amount - totalDeductions

  const entries = []

  // Debit 2000 — reverse liability (full deposit amount)
  entries.push({ accountCode: '2000', debit: deposit.amount, credit: 0, description: 'Libération dépôt client' })

  // Credit 1200 — reduce asset (refunded portion)
  if (refundAmount > 0) {
    entries.push({ accountCode: '1200', debit: 0, credit: refundAmount, description: 'Remboursement dépôt au client' })
  }

  // Debit 1100 — book the excess (deductions > deposit) as an additional
  // receivable so the journal stays balanced.
  if (refundAmount < 0) {
    entries.push({ accountCode: '1100', debit: -refundAmount, credit: 0, description: 'Créance — retenues > dépôt' })
  }

  // Credit revenue accounts for each deduction
  deductions.forEach(ded => {
    const code = ded.accountCode || '3020'
    entries.push({ accountCode: code, debit: 0, credit: Number(ded.amount), description: ded.reason || 'Retenue sur dépôt' })
  })

  const tx = await postTransaction({
    date: new Date().toISOString().slice(0, 10),
    description: `Libération dépôt — ${deposit.clientName}`,
    type: 'deposit_release',
    contractId: deposit.contractId,
    entries,
  })

  const status = totalDeductions > 0 && refundAmount > 0
    ? 'partially_released'
    : refundAmount <= 0 ? 'retained' : 'released'

  return saveDeposit({
    ...deposit,
    status,
    deductions,
    releasedAmount: refundAmount,
    releasedAt: new Date().toISOString().slice(0, 10),
    releaseTransactionId: tx.id,
  })
}

// ── Agency payout computation ─────────────────────────────
export async function computeAgencyPayout({ startDate, endDate } = {}) {
  const entries = await getJournalEntries()
  const accounts = await getAccounts()

  const inRange = e => {
    if (!startDate && !endDate) return true
    if (startDate && e.date < startDate) return false
    if (endDate   && e.date > endDate)   return false
    return true
  }

  const filtered = entries.filter(inRange)

  let totalRevenue  = 0
  let totalExpenses = 0
  let platformFees  = 0
  const byAccount   = {}

  filtered.forEach(e => {
    const acc = accounts.find(a => a.code === e.accountCode)
    if (!acc) return

    const key = e.accountCode

    if (acc.type === 'revenue') {
      const amount = Number(e.credit) - Number(e.debit)
      totalRevenue += amount
      byAccount[key] = (byAccount[key] || { name: acc.name, amount: 0 })
      byAccount[key].amount += amount
    }

    if (acc.type === 'expense') {
      const amount = Number(e.debit) - Number(e.credit)
      totalExpenses += amount
      if (e.accountCode === '4030') platformFees += amount
    }
  })

  const netPayout = totalRevenue - platformFees

  return {
    totalRevenue,
    totalExpenses,
    platformFees,
    netPayout,
    breakdown: { byAccount },
  }
}

// ── Backfill journal entries for historical closed contracts ──
// One-shot maintenance helper. Posts a rental invoice for every contract
// whose status='closed' AND that has no transaction row yet. Idempotent:
// re-running it after a partial run skips anything already posted.
//
// Returns { created, skipped, errors: [{ contractId, message }] }.
export async function backfillJournalForClosedContracts() {
  const [contracts, transactions] = await Promise.all([
    getContracts(),
    getTransactions(),
  ])

  const alreadyPosted = new Set(
    transactions
      .filter(t => t.contractId && (t.type === 'invoice' || t.type === 'manual'))
      .map(t => t.contractId)
  )

  const closed = contracts.filter(c => c.status === 'closed')

  const result = { created: 0, skipped: 0, errors: [] }
  for (const c of closed) {
    if (alreadyPosted.has(c.id)) { result.skipped++; continue }
    try {
      await generateRentalInvoice(c.id)
      result.created++
    } catch (err) {
      result.errors.push({ contractId: c.id, contractNumber: c.contractNumber, message: err.message })
    }
  }
  return result
}

// ── P&L summary ───────────────────────────────────────────
export async function computePL({ startDate, endDate } = {}) {
  const { totalRevenue, totalExpenses } = await computeAgencyPayout({ startDate, endDate })
  return {
    revenue:  totalRevenue,
    expenses: totalExpenses,
    profit:   totalRevenue - totalExpenses,
  }
}
