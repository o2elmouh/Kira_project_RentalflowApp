import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AgedReceivablesView from '../../pages/accounting/AgedReceivablesView.jsx'

// ══════════════════════════════════════════════════════════════
// AgedReceivablesView — v1.16.2 rewrite. The previous version read
// non-existent fields (totalExtraFees, clientName, vehicleName,
// returnDate) so the view always rendered "Aucune créance". These
// tests pin the new derivation: total_amount - amount_paid drives the
// receivable, and names are resolved from clients/fleet props.
// ══════════════════════════════════════════════════════════════
describe('AgedReceivablesView', () => {
  const contracts = [
    // Owes 200 (partially paid) — should appear
    { id: 'c-1', status: 'closed', contractNumber: 'C001',
      clientId: 'cl-1', vehicleId: 'v-1',
      totalTTC: 1200, amountPaid: 1000,
      endDate: '2026-05-01' },
    // Fully paid — should NOT appear
    { id: 'c-2', status: 'closed', contractNumber: 'C002',
      clientId: 'cl-2', vehicleId: 'v-2',
      totalTTC: 800,  amountPaid: 800,
      endDate: '2026-05-01' },
    // Active — should NOT appear
    { id: 'c-3', status: 'active', contractNumber: 'C003',
      clientId: 'cl-1', vehicleId: 'v-1',
      totalTTC: 500,  amountPaid: 0 },
    // Snake-case shape (raw DB row in case the mapper ever changes)
    { id: 'c-4', status: 'closed', contractNumber: 'C004',
      clientId: 'cl-2', vehicleId: 'v-2',
      total_amount: 600, amount_paid: 300,
      actualReturnDate: '2026-04-15' },
  ]
  const clients = [
    { id: 'cl-1', firstName: 'Alice', lastName: 'Andalou' },
    { id: 'cl-2', firstName: 'Bob',   lastName: 'Berrada' },
  ]
  const fleet = [
    { id: 'v-1', make: 'Dacia', model: 'Duster' },
    { id: 'v-2', brand: 'Renault', model: 'Clio' },
  ]

  it('lists only closed contracts with an outstanding balance', () => {
    render(<AgedReceivablesView contracts={contracts} clients={clients} fleet={fleet} />)
    // c-1 (200 due) and c-4 (300 due) appear
    expect(screen.getByText('C001')).toBeInTheDocument()
    expect(screen.getByText('C004')).toBeInTheDocument()
    // c-2 (fully paid) and c-3 (active) do not
    expect(screen.queryByText('C002')).not.toBeInTheDocument()
    expect(screen.queryByText('C003')).not.toBeInTheDocument()
  })

  it('resolves client and vehicle names from the props', () => {
    render(<AgedReceivablesView contracts={contracts} clients={clients} fleet={fleet} />)
    expect(screen.getByText('Alice Andalou')).toBeInTheDocument()
    expect(screen.getByText('Bob Berrada')).toBeInTheDocument()
    expect(screen.getByText('Dacia Duster')).toBeInTheDocument()
    expect(screen.getByText('Renault Clio')).toBeInTheDocument()
  })

  it('reads total_amount/amount_paid (snake_case) when the mapped fields are missing', () => {
    // c-4 has only the snake_case columns set → due = 600 - 300 = 300
    render(<AgedReceivablesView contracts={[contracts[3]]} clients={clients} fleet={fleet} />)
    expect(screen.getByText('C004')).toBeInTheDocument()
    // "300,00 MAD" shows in BOTH the row cell AND the total footer.
    expect(screen.getAllByText(/300,00 MAD/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the happy-path empty state when nothing is owed', () => {
    render(<AgedReceivablesView contracts={[contracts[1]]} clients={clients} fleet={fleet} />)
    expect(screen.getByText(/Aucune créance en souffrance/)).toBeInTheDocument()
  })

  it('falls back gracefully when a client or vehicle is missing from the maps', () => {
    const orphan = [{ id: 'c-orphan', status: 'closed', contractNumber: 'C-X',
      clientId: 'unknown', vehicleId: 'unknown',
      totalTTC: 100, amountPaid: 0, endDate: '2026-05-01' }]
    render(<AgedReceivablesView contracts={orphan} clients={[]} fleet={[]} />)
    // Two — header + data row.
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('C-X')).toBeInTheDocument()
  })
})
