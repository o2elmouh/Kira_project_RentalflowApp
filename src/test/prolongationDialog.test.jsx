import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('../../lib/db.js', () => ({
  updateContract: vi.fn().mockResolvedValue(undefined),
  saveInvoice: vi.fn().mockResolvedValue(undefined),
  updateInvoice: vi.fn().mockResolvedValue(undefined),
  getInvoices: vi.fn().mockResolvedValue([]),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => {
      const str = opts?.defaultValue || k
      if (!opts) return str
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (opts[key] !== undefined ? opts[key] : `{{${key}}}`))
    },
  }),
}))

import ProlongationDialog from '../../components/ProlongationDialog.jsx'
import * as db from '../../lib/db.js'

const baseContract = {
  id: 'ctr-1',
  clientId: 'cli-1',
  clientName: 'Karim El Fassi',
  contractNumber: 'CTR-00003',
  vehicleId: 'veh-1',
  vehicleName: 'Audi A1',
  startDate: '2026-08-01',
  endDate: '2026-08-31',
  dailyRate: 200,
  totalTTC: 6000,
  days: 30,
}

beforeEach(() => {
  db.updateContract.mockClear()
  db.saveInvoice.mockClear()
  db.updateInvoice.mockClear()
  db.getInvoices.mockClear()
})

describe('ProlongationDialog', () => {
  it('pre-fills newEndDate from prefilledEndDate prop', () => {
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    const dateInput = screen.getByLabelText(/nouvelle date de fin/i)
    expect(dateInput.value).toBe('2026-09-15')
  })

  it('computes extra days and amount from contract endDate to new endDate', () => {
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    // 31 Aug → 15 Sep = 15 extra days, rate 200, +3000
    expect(screen.getByText(/15 jour/i)).toBeInTheDocument()
    expect(screen.getByText(/3000/)).toBeInTheDocument()
  })

  it('calls updateContract and onConfirmed on confirm', async () => {
    const onConfirmed = vi.fn()
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={onConfirmed}
      />
    )
    fireEvent.click(screen.getByText(/confirmer/i))
    await waitFor(() => expect(db.updateContract).toHaveBeenCalled())
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled())
  })

  it('creates a new invoice when daily rate changes', async () => {
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={() => {}}
        onConfirmed={() => {}}
      />
    )
    const rateInput = screen.getByLabelText(/tarif journalier/i)
    fireEvent.change(rateInput, { target: { value: '250' } })
    fireEvent.click(screen.getByText(/confirmer/i))
    await waitFor(() => expect(db.saveInvoice).toHaveBeenCalled())
  })

  it('calls onClose without writing when Annuler is clicked', () => {
    const onClose = vi.fn()
    const onConfirmed = vi.fn()
    render(
      <ProlongationDialog
        contract={baseContract}
        vehicle={{ dailyRate: 200 }}
        prefilledEndDate="2026-09-15"
        onClose={onClose}
        onConfirmed={onConfirmed}
      />
    )
    fireEvent.click(screen.getByText(/annuler/i))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirmed).not.toHaveBeenCalled()
    expect(db.updateContract).not.toHaveBeenCalled()
  })
})
