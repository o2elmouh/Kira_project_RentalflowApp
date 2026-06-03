import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, opts) => opts?.defaultValue || k }),
}))

const findVehicleConflictsMock = vi.fn().mockResolvedValue([])

vi.mock('../../lib/db.js', () => ({
  getContractById: vi.fn().mockResolvedValue({
    id: 'ctr-1',
    contractNumber: 'CTR-00003',
    vehicleName: 'Audi A1',
    clientName: 'Karim El Fassi',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    dailyRate: 200,
    totalTTC: 6000,
    vehicleId: 'veh-1',
  }),
  getVehicle: vi.fn().mockResolvedValue({ id: 'veh-1', dailyRate: 200 }),
  findVehicleConflicts: (...args) => findVehicleConflictsMock(...args),
  updateContract: vi.fn().mockResolvedValue(undefined),
  saveInvoice: vi.fn().mockResolvedValue(undefined),
  updateInvoice: vi.fn().mockResolvedValue(undefined),
  getInvoices: vi.fn().mockResolvedValue([]),
  getAvailableVehicles: vi.fn().mockResolvedValue([]),
}))

import LeadModal from '../../components/LeadModal.jsx'

const prolongationLead = {
  id: 'lead-1',
  classification: 'prolongation',
  status: 'pending',
  prolongation_target_contract_id: 'ctr-1',
  extracted_data: {
    classification: 'prolongation',
    summary_for_agent: 'Client wants to extend until 15 Sept',
    end_date: '2026-09-15',
  },
}

const multiCandidateLead = {
  id: 'lead-2',
  classification: 'prolongation',
  status: 'pending',
  prolongation_target_contract_id: null,
  extracted_data: {
    classification: 'prolongation',
    end_date: '2026-09-15',
    prolongation_candidates: ['ctr-1', 'ctr-2'],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  findVehicleConflictsMock.mockResolvedValue([])
})

describe('LeadModal — prolongation variant', () => {
  it('renders the Prolongation badge for prolongation leads', () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(screen.getAllByText(/prolongation/i).length).toBeGreaterThan(0)
  })

  it('renders the Prolonger contrat CTA for a linked prolongation lead', async () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    // Wait for the async contract load before asserting CTA is enabled
    const cta = await screen.findByRole('button', { name: /prolonger contrat/i })
    // It may be disabled briefly while the contract loads; poll
    await new Promise(r => setTimeout(r, 30))
    expect(cta).toBeEnabled()
  })

  it('disables the CTA when multi-candidate lead has no selection', () => {
    render(<LeadModal lead={multiCandidateLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(screen.getByRole('button', { name: /prolonger contrat/i })).toBeDisabled()
  })

  it('opens the ProlongationDialog when CTA clicked', async () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    const cta = await screen.findByRole('button', { name: /prolonger contrat/i })
    await new Promise(r => setTimeout(r, 30))
    fireEvent.click(cta)
    expect(await screen.findByLabelText(/nouvelle date de fin/i)).toBeInTheDocument()
  })

  it('displays contract number, start date, and initial end date once the contract loads', async () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(await screen.findByText('CTR-00003')).toBeInTheDocument()
    expect(await screen.findByText('2026-08-01')).toBeInTheDocument()
    expect(await screen.findByText('2026-08-31')).toBeInTheDocument()
  })

  it('queries findVehicleConflicts with the extension window [contract.endDate → extracted.end_date]', async () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    await new Promise(r => setTimeout(r, 50))
    expect(findVehicleConflictsMock).toHaveBeenCalledWith(
      'veh-1',
      '2026-08-31',
      '2026-09-15',
      'ctr-1',
    )
  })

  it('renders an amber warning and a smart-quote CTA when the vehicle has a conflict', async () => {
    findVehicleConflictsMock.mockResolvedValue([
      { id: 'ctr-9', contractNumber: 'CTR-00009', startDate: '2026-09-01', endDate: '2026-09-10', clientName: 'Other', vehicleId: 'veh-1' },
    ])
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    expect(await screen.findByText(/véhicule indisponible/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /proposer un autre véhicule/i })).toBeInTheDocument()
  })

  it('does not render the conflict warning when there are no overlapping contracts', async () => {
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    await new Promise(r => setTimeout(r, 50))
    expect(screen.queryByText(/véhicule indisponible/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /proposer un autre véhicule/i })).not.toBeInTheDocument()
  })

  it('reveals the SmartQuotePanel when "Proposer un autre véhicule" is clicked', async () => {
    findVehicleConflictsMock.mockResolvedValue([
      { id: 'ctr-9', contractNumber: 'CTR-00009', startDate: '2026-09-01', endDate: '2026-09-10', clientName: 'Other', vehicleId: 'veh-1' },
    ])
    render(<LeadModal lead={prolongationLead} onClose={() => {}} onStatusChange={() => {}} />)
    const altBtn = await screen.findByRole('button', { name: /proposer un autre véhicule/i })
    fireEvent.click(altBtn)
    // SmartQuotePanel renders a "Véhicule disponible" <label> + a vehicle
    // <select>. Use the select (combobox) since it's unique to that panel.
    expect(await screen.findByRole('combobox')).toBeInTheDocument()
  })
})
