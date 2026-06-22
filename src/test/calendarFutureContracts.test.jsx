import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}))

const fleet = [{ id: 'veh-1', make: 'Dacia', model: 'Logan', plate: '1234-A-1' }]
let contracts = []

vi.mock('../hooks/useFleet', () => ({ useFleet: () => ({ data: fleet, isLoading: false }) }))
vi.mock('../hooks/useContracts', () => ({ useContracts: () => ({ data: contracts, isLoading: false }) }))

import Calendar from '../../pages/Calendar.jsx'

// Helpers to build ISO dates relative to "today"
function iso(d) { return d.toISOString().slice(0, 10) }

describe('Calendar — future finalized contracts', () => {
  it('shows a contract spanning the CURRENT month (default view)', () => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    contracts = [{ id: 'c1', contractNumber: 'CTR-CUR', vehicleId: 'veh-1', status: 'active', startDate: iso(first), endDate: iso(last) }]
    render(<Calendar />)
    expect(screen.getByText('CTR-CUR')).toBeInTheDocument()
  })

  it('shows a FUTURE next-month contract after navigating forward one month', () => {
    const now = new Date()
    const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextEnd = new Date(now.getFullYear(), now.getMonth() + 1, 5)
    contracts = [{ id: 'c2', contractNumber: 'CTR-FUT', vehicleId: 'veh-1', status: 'active', startDate: iso(nextStart), endDate: iso(nextEnd) }]
    render(<Calendar />)
    // not visible in current month
    expect(screen.queryByText('CTR-FUT')).not.toBeInTheDocument()
    // navigate forward one month (the ">" button)
    fireEvent.click(screen.getByText('›'))
    expect(screen.getByText('CTR-FUT')).toBeInTheDocument()
  })
})
