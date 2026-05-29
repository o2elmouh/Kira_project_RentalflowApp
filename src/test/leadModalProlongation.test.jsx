import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k, opts) => opts?.defaultValue || k }),
}))

vi.mock('../../lib/db.js', () => ({
  getContractById: vi.fn().mockResolvedValue({
    id: 'ctr-1',
    contractNumber: 'CTR-00003',
    vehicleName: 'Audi A1',
    clientName: 'Karim El Fassi',
    endDate: '2026-08-31',
    dailyRate: 200,
    totalTTC: 6000,
    vehicleId: 'veh-1',
  }),
  getVehicle: vi.fn().mockResolvedValue({ id: 'veh-1', dailyRate: 200 }),
  updateContract: vi.fn().mockResolvedValue(undefined),
  saveInvoice: vi.fn().mockResolvedValue(undefined),
  updateInvoice: vi.fn().mockResolvedValue(undefined),
  getInvoices: vi.fn().mockResolvedValue([]),
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

beforeEach(() => vi.clearAllMocks())

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
})
