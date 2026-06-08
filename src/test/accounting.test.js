import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the entire lib/db module so we can assert what utils/accounting.js
// passes to it WITHOUT touching Supabase.
vi.mock('../../lib/db.js', () => ({
  getAccounts:           vi.fn(),
  getContracts:          vi.fn(),
  getContract:           vi.fn(),
  getJournalEntries:     vi.fn(),
  saveTransaction:       vi.fn(),
  saveJournalEntries:    vi.fn(),
  saveDeposit:           vi.fn(),
  getDepositByContract:  vi.fn(),
  getDeposits:           vi.fn(),
}))

import {
  getAccounts,
  getContract,
  getJournalEntries,
  saveTransaction,
  saveJournalEntries,
  saveDeposit,
  getDeposits,
} from '../../lib/db.js'

import {
  postTransaction,
  generateRentalInvoice,
  holdDeposit,
  releaseDeposit,
  computeAgencyPayout,
  computePL,
} from '../../utils/accounting.js'

// ── Default chart of accounts used by most tests ──────────────
const ACCOUNTS = [
  { code: '1100', name: 'Créances clients',                type: 'asset',     normalBalance: 'debit'  },
  { code: '1200', name: 'Dépôts à recevoir',                type: 'asset',     normalBalance: 'debit'  },
  { code: '2000', name: 'Dépôts clients',                   type: 'liability', normalBalance: 'credit' },
  { code: '2100', name: 'TVA collectée',                    type: 'liability', normalBalance: 'credit' },
  { code: '3000', name: 'CA Location',                       type: 'revenue',   normalBalance: 'credit' },
  { code: '3020', name: 'Frais de restitution',             type: 'revenue',   normalBalance: 'credit' },
  { code: '3030', name: 'Frais km supp',                    type: 'revenue',   normalBalance: 'credit' },
  { code: '4000', name: 'Entretien',                         type: 'expense',   normalBalance: 'debit'  },
  { code: '4030', name: 'Commission plateforme',             type: 'expense',   normalBalance: 'debit'  },
]

beforeEach(() => {
  vi.clearAllMocks()
  getAccounts.mockResolvedValue(ACCOUNTS)
})

// ══════════════════════════════════════════════════════════════
// postTransaction
// ══════════════════════════════════════════════════════════════
describe('postTransaction', () => {
  it('throws when debits and credits do not balance', async () => {
    await expect(postTransaction({
      description: 'unbalanced',
      entries: [
        { accountCode: '1100', debit: 100, credit: 0 },
        { accountCode: '3000', debit: 0,   credit: 99 },
      ],
    })).rejects.toThrow(/déséquilibrée/)
    expect(saveTransaction).not.toHaveBeenCalled()
    expect(saveJournalEntries).not.toHaveBeenCalled()
  })

  it('persists transaction + journal lines when balanced', async () => {
    saveTransaction.mockResolvedValue({ id: 'tx-1', reference: 'TXN-X', date: '2026-06-08' })

    await postTransaction({
      date: '2026-06-08',
      description: 'invoice',
      type: 'invoice',
      contractId: 'c-1',
      entries: [
        { accountCode: '1100', debit: 120, credit: 0 },
        { accountCode: '3000', debit: 0,   credit: 100 },
        { accountCode: '2100', debit: 0,   credit: 20  },
      ],
    })

    expect(saveTransaction).toHaveBeenCalledTimes(1)
    expect(saveTransaction).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-06-08', description: 'invoice', type: 'invoice', contractId: 'c-1', totalAmount: 120,
    }))

    expect(saveJournalEntries).toHaveBeenCalledTimes(1)
    const lines = saveJournalEntries.mock.calls[0][0]
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ transactionId: 'tx-1', accountCode: '1100', accountName: 'Créances clients', debit: 120, credit: 0 })
    expect(lines[1]).toMatchObject({ accountCode: '3000', accountName: 'CA Location', credit: 100 })
    expect(lines[2]).toMatchObject({ accountCode: '2100', accountName: 'TVA collectée', credit: 20 })
  })

  it('tolerates rounding noise within 1 centime', async () => {
    saveTransaction.mockResolvedValue({ id: 'tx-2', reference: 'r', date: '2026-06-08' })
    // 100.001 vs 100.005 — diff is 0.004 < 0.01 → passes
    await expect(postTransaction({
      description: 'rounded',
      entries: [
        { accountCode: '1100', debit: 100.001, credit: 0 },
        { accountCode: '3000', debit: 0, credit: 100.005 },
      ],
    })).resolves.toBeDefined()
  })

  it('falls back account name to the code when no chart match', async () => {
    saveTransaction.mockResolvedValue({ id: 'tx-3', reference: 'r', date: '2026-06-08' })
    await postTransaction({
      description: 'unknown code',
      entries: [
        { accountCode: '9999', debit: 10, credit: 0 },
        { accountCode: '3000', debit: 0,  credit: 10 },
      ],
    })
    const lines = saveJournalEntries.mock.calls[0][0]
    expect(lines[0].accountName).toBe('9999')
  })
})

// ══════════════════════════════════════════════════════════════
// generateRentalInvoice
// ══════════════════════════════════════════════════════════════
describe('generateRentalInvoice', () => {
  it('throws when contract is not found', async () => {
    getContract.mockResolvedValue(null)
    await expect(generateRentalInvoice('missing')).rejects.toThrow(/Contrat introuvable/)
  })

  it('emits exactly the right lines for a plain rental (no extras)', async () => {
    getContract.mockResolvedValue({
      id: 'c-1', contractNumber: 'C001', clientName: 'Alice',
      totalHT: 1000, tva: 200, totalTTC: 1200,
      extraKmFee: 0, fuelFee: 0, damageFee: 0,
      endDate: '2026-06-08',
    })
    saveTransaction.mockResolvedValue({ id: 'tx-r1', reference: 'r', date: '2026-06-08' })

    await generateRentalInvoice('c-1')

    const lines = saveJournalEntries.mock.calls[0][0]
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ accountCode: '1100', debit: 1200 })
    expect(lines[1]).toMatchObject({ accountCode: '3000', credit: 1000 })
    expect(lines[2]).toMatchObject({ accountCode: '2100', credit: 200 })
  })

  it('splits revenue across CA / extra-km / restitution accounts', async () => {
    // totalHT=1500 (base 1000 + extraKm 200 + restitution 300), tva=300, total=1800
    getContract.mockResolvedValue({
      id: 'c-2', contractNumber: 'C002', clientName: 'Bob',
      totalHT: 1500, tva: 300, totalTTC: 1800,
      extraKmFee: 200, fuelFee: 100, damageFee: 200, // restitutionFee = 300
      endDate: '2026-06-08',
    })
    saveTransaction.mockResolvedValue({ id: 'tx-r2', reference: 'r', date: '2026-06-08' })

    await generateRentalInvoice('c-2')

    const lines = saveJournalEntries.mock.calls[0][0]
    const byCode = Object.fromEntries(lines.map(l => [l.accountCode, l]))
    expect(byCode['1100'].debit).toBe(1800)
    expect(byCode['3000'].credit).toBe(1000) // baseCA = 1500 - 200 - 300
    expect(byCode['3030'].credit).toBe(200)
    expect(byCode['3020'].credit).toBe(300)
    expect(byCode['2100'].credit).toBe(300)

    // Debits == credits
    const debits  = lines.reduce((s, l) => s + (l.debit  || 0), 0)
    const credits = lines.reduce((s, l) => s + (l.credit || 0), 0)
    expect(debits).toBeCloseTo(credits, 2)
  })
})

// ══════════════════════════════════════════════════════════════
// holdDeposit
// ══════════════════════════════════════════════════════════════
describe('holdDeposit', () => {
  it('posts a balanced 1200 / 2000 entry and writes the deposit row', async () => {
    saveTransaction.mockResolvedValue({ id: 'tx-h', reference: 'r', date: '2026-06-08' })
    saveDeposit.mockResolvedValue({ id: 'd1', amount: 3000, status: 'held' })

    await holdDeposit({
      contractId: 'c-9', clientName: 'Alice', vehicleName: 'Dacia Duster',
      amount: 3000, date: '2026-06-08',
    })

    const lines = saveJournalEntries.mock.calls[0][0]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ accountCode: '1200', debit: 3000, credit: 0 })
    expect(lines[1]).toMatchObject({ accountCode: '2000', debit: 0,    credit: 3000 })

    expect(saveDeposit).toHaveBeenCalledTimes(1)
    expect(saveDeposit).toHaveBeenCalledWith(expect.objectContaining({
      contractId: 'c-9', clientName: 'Alice', vehicleName: 'Dacia Duster',
      amount: 3000, status: 'held', transactionId: 'tx-h',
    }))
  })
})

// ══════════════════════════════════════════════════════════════
// releaseDeposit
// ══════════════════════════════════════════════════════════════
describe('releaseDeposit', () => {
  const baseDeposit = {
    id: 'd1', contractId: 'c-9', clientName: 'Alice', amount: 3000, status: 'held',
  }

  it('refunds the full amount when there are no deductions → status released', async () => {
    getDeposits.mockResolvedValue([baseDeposit])
    saveTransaction.mockResolvedValue({ id: 'tx-rel', reference: 'r', date: '2026-06-08' })

    await releaseDeposit({ depositId: 'd1', deductions: [] })

    const lines = saveJournalEntries.mock.calls[0][0]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ accountCode: '2000', debit: 3000, credit: 0 })
    expect(lines[1]).toMatchObject({ accountCode: '1200', credit: 3000 })

    expect(saveDeposit).toHaveBeenCalledWith(expect.objectContaining({
      id: 'd1', status: 'released', releasedAmount: 3000,
    }))
  })

  it('routes each deduction to its revenue account → status partially_released', async () => {
    getDeposits.mockResolvedValue([baseDeposit])
    saveTransaction.mockResolvedValue({ id: 'tx-rel2', reference: 'r', date: '2026-06-08' })

    await releaseDeposit({
      depositId: 'd1',
      deductions: [
        { reason: 'Km supp',  amount: 500, accountCode: '3030' },
        { reason: 'Carburant', amount: 200, accountCode: '3020' },
      ],
    })

    const lines = saveJournalEntries.mock.calls[0][0]
    const byCode = Object.fromEntries(lines.map(l => [l.accountCode, l]))
    expect(byCode['2000'].debit).toBe(3000)  // reverse liability
    expect(byCode['1200'].credit).toBe(2300) // refund portion
    expect(byCode['3030'].credit).toBe(500)
    expect(byCode['3020'].credit).toBe(200)

    expect(saveDeposit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'partially_released', releasedAmount: 2300,
    }))
  })

  it('marks the deposit retained when deductions equal or exceed the amount', async () => {
    getDeposits.mockResolvedValue([baseDeposit])
    saveTransaction.mockResolvedValue({ id: 'tx-rel3', reference: 'r', date: '2026-06-08' })

    await releaseDeposit({
      depositId: 'd1',
      deductions: [{ reason: 'Dommages graves', amount: 3500, accountCode: '3020' }],
    })

    expect(saveDeposit).toHaveBeenCalledWith(expect.objectContaining({
      status: 'retained', releasedAmount: -500,
    }))
  })

  it('throws when the deposit id is unknown', async () => {
    getDeposits.mockResolvedValue([])
    await expect(releaseDeposit({ depositId: 'missing' })).rejects.toThrow(/Dépôt introuvable/)
  })
})

// ══════════════════════════════════════════════════════════════
// computeAgencyPayout / computePL
// ══════════════════════════════════════════════════════════════
describe('computeAgencyPayout', () => {
  it('classifies revenue and expense correctly and tracks platform fees', async () => {
    getJournalEntries.mockResolvedValue([
      { date: '2026-06-01', accountCode: '3000', debit: 0,   credit: 1000 },
      { date: '2026-06-02', accountCode: '3020', debit: 0,   credit: 200  },
      { date: '2026-06-03', accountCode: '4000', debit: 150, credit: 0    },
      { date: '2026-06-04', accountCode: '4030', debit: 100, credit: 0    }, // platform fee
    ])

    const r = await computeAgencyPayout({ startDate: '2026-06-01', endDate: '2026-06-30' })

    expect(r.totalRevenue).toBe(1200)
    expect(r.totalExpenses).toBe(250)
    expect(r.platformFees).toBe(100)
    expect(r.netPayout).toBe(1100) // revenue - platform fee
    expect(r.breakdown.byAccount['3000']).toEqual({ name: 'CA Location', amount: 1000 })
    expect(r.breakdown.byAccount['3020']).toEqual({ name: 'Frais de restitution', amount: 200 })
  })

  it('respects the date range filter', async () => {
    getJournalEntries.mockResolvedValue([
      { date: '2026-05-30', accountCode: '3000', debit: 0, credit: 999 }, // out of range
      { date: '2026-06-15', accountCode: '3000', debit: 0, credit: 100 },
      { date: '2026-07-01', accountCode: '3000', debit: 0, credit: 555 }, // out of range
    ])
    const r = await computeAgencyPayout({ startDate: '2026-06-01', endDate: '2026-06-30' })
    expect(r.totalRevenue).toBe(100)
  })

  it('ignores entries whose account code is not in the chart', async () => {
    getJournalEntries.mockResolvedValue([
      { date: '2026-06-01', accountCode: '3000', debit: 0, credit: 100 },
      { date: '2026-06-01', accountCode: '9999', debit: 0, credit: 999 }, // orphan
    ])
    const r = await computeAgencyPayout({})
    expect(r.totalRevenue).toBe(100)
  })
})

describe('computePL', () => {
  it('exposes revenue / expenses / profit derived from computeAgencyPayout', async () => {
    getJournalEntries.mockResolvedValue([
      { date: '2026-06-01', accountCode: '3000', debit: 0,   credit: 1000 },
      { date: '2026-06-03', accountCode: '4000', debit: 300, credit: 0    },
    ])
    const pl = await computePL({})
    expect(pl).toEqual({ revenue: 1000, expenses: 300, profit: 700 })
  })
})
