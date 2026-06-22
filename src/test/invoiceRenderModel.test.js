import { describe, it, expect } from 'vitest'
import { invoiceRenderModel } from '../../utils/pdf.js'

// Regression coverage for the surplus-invoice preview bug: the restitution
// (end-of-rental) invoice was rendering the full rental total because the PDF
// builder read figures off the contract instead of the invoice record.

describe('invoiceRenderModel', () => {
  const vehicle = { make: 'Citroën', model: 'C4', plate: '0156433', dailyRate: 300 }

  it('renders a restitution invoice from its own items + totals, not the contract', () => {
    const invoice = {
      type: 'restitution',
      totalHT: 125,
      tva: 25,
      totalTTC: 150,
      notes: 'Frais de restitution',
      items: [{ label: 'Manque carburant', qty: 1.5, unitPrice: 100 }],
    }
    // Contract carries the inflated final total (rental + surplus) — must be ignored.
    const contract = { totalTTC: 2214, totalHT: undefined, tva: undefined, contractNumber: 'CTR-00003', days: 4 }

    const m = invoiceRenderModel(invoice, contract, vehicle)

    expect(m.title).toBe('FACTURE — FRAIS DE RESTITUTION')
    expect(m.totalTTC).toBe(150)
    // Body comes from the invoice items, not the rental line.
    expect(m.body).toEqual([['Manque carburant', '1.5', '100', '150']])
    // Foot totals reflect the surplus, never the contract's 2214.
    expect(m.foot).toEqual([
      ['', '', 'Total HT', '125 MAD'],
      ['', '', 'TVA (20%)', '25 MAD'],
      ['', '', 'TOTAL TTC', '150 MAD'],
    ])
  })

  it('renders a rental invoice from its own totals with the location line', () => {
    const invoice = { type: 'rental', totalHT: 1200, tva: 240, totalTTC: 1440, days: 4 }
    const contract = { contractNumber: 'CTR-00001', days: 4 }

    const m = invoiceRenderModel(invoice, contract, vehicle)

    expect(m.title).toBe('FACTURE DE LOCATION')
    expect(m.totalTTC).toBe(1440)
    expect(m.body[0][0]).toContain('Location Citroën C4')
    expect(m.body[0][3]).toBe('1200') // line HT from the invoice total
    expect(m.foot[2]).toEqual(['', '', 'TOTAL TTC', '1440 MAD'])
  })

  it('treats a missing type as a rental invoice', () => {
    const m = invoiceRenderModel({ totalTTC: 500, totalHT: 416.67, tva: 83.33 }, {}, vehicle)
    expect(m.title).toBe('FACTURE DE LOCATION')
  })

  it('falls back to contract figures for a legacy invoice with no totals', () => {
    const invoice = { type: 'rental' } // no totals persisted
    const contract = { totalHT: 1000, tva: 200, totalTTC: 1200, days: 3 }
    const m = invoiceRenderModel(invoice, contract, vehicle)
    expect(m.foot[2]).toEqual(['', '', 'TOTAL TTC', '1200 MAD'])
  })

  it('rounds derived amounts to 2 decimals (no float noise)', () => {
    // 150 / 1.20 = 125 exactly, but assert rounding holds for an awkward value.
    const invoice = { type: 'restitution', totalHT: 100 / 3, tva: 0, totalTTC: 100 / 3, items: [{ label: 'X', qty: 1, unitPrice: 33.333 }] }
    const m = invoiceRenderModel(invoice, {}, vehicle)
    expect(m.foot[0]).toEqual(['', '', 'Total HT', '33.33 MAD'])
  })

  it('legacy restitution invoice without items renders a generic line, never a rental line', () => {
    // Mirrors the backfilled row: type set by migration, items never persisted.
    const invoice = { type: 'restitution', totalHT: 125, tva: 25, totalTTC: 150, notes: 'Frais de restitution' }
    const contract = { totalTTC: 2214, contractNumber: 'CTR-00003', days: 4 }
    const m = invoiceRenderModel(invoice, contract, vehicle)
    expect(m.title).toBe('FACTURE — FRAIS DE RESTITUTION')
    expect(m.body).toEqual([['Frais de restitution', '1', '125', '125']])
    expect(m.foot[2]).toEqual(['', '', 'TOTAL TTC', '150 MAD'])
  })

  it('empty items array falls back to the rental line', () => {
    const invoice = { type: 'rental', items: [], totalHT: 900, tva: 180, totalTTC: 1080, days: 3 }
    const m = invoiceRenderModel(invoice, { days: 3 }, vehicle)
    expect(m.body[0][0]).toContain('Location')
  })
})
