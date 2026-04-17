/**
 * Tests for pages/rental/RentalStep
 *
 * Strategy:
 *   - Mock lib/db (getAvailableVehicles) and utils/rentalOptions (getRentalOptions)
 *   - Render RentalStep with minimal props
 *   - Test: date validation, vehicle selection, price calculation, canContinue guard
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../lib/db', () => ({
  getAvailableVehicles: vi.fn(),
}))

vi.mock('../../utils/rentalOptions', () => ({
  getRentalOptions: vi.fn(),
}))

vi.mock('../../pages/rental/StepButtons', () => ({
  default: ({ leftBtns, rightBtns }) => (
    <div data-testid="step-buttons">
      {leftBtns}
      {rightBtns}
    </div>
  ),
}))

// react-i18next — RentalStep doesn't use it but sub-imports might
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k }),
}))

const { getAvailableVehicles } = await import('../../lib/db')
const { getRentalOptions }     = await import('../../utils/rentalOptions')
const { default: RentalStep }  = await import('../../pages/rental/RentalStep.jsx')

// ── Fixtures ──────────────────────────────────────────────────

const getMockVehicle = (o = {}) => ({
  id: 'v-1', make: 'Dacia', model: 'Logan', year: 2022,
  plate: '1-A-1234', category: 'Economy', color: 'Blanc',
  fuelType: 'Essence', dailyRate: 300,
  ...o,
})

const defaultProps = {
  client: { id: 'c-1', firstName: 'Youssef' },
  onNext: vi.fn(),
  onBack: vi.fn(),
  onSaveAndQuit: vi.fn(),
  onCancel: vi.fn(),
  initialRental: null,
}

// ── Helpers ───────────────────────────────────────────────────

const today   = new Date().toISOString().split('T')[0]
const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

/** Get the two date inputs [startDate, endDate] from the rendered container */
const getDateInputs = (container) => container.querySelectorAll('input[type="date"]')

// ── Tests ─────────────────────────────────────────────────────

describe('RentalStep', () => {
  beforeEach(() => {
    getRentalOptions.mockResolvedValue([])
    getAvailableVehicles.mockResolvedValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ── Continuer button guard ─────────────────────────────────

  describe('"Continuer" button (canContinue guard)', () => {
    it('is disabled on initial render (no vehicle, no endDate)', async () => {
      render(<RentalStep {...defaultProps} />)
      const btn = await screen.findByText(/Continuer/i)
      expect(btn).toBeDisabled()
    })

    it('is disabled when dates are valid but no vehicle selected', async () => {
      getAvailableVehicles.mockResolvedValue([getMockVehicle()])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })

      await waitFor(() => screen.getByText('1-A-1234'))
      expect(screen.getByText(/Continuer/i)).toBeDisabled()
    })

    it('is enabled when valid dates AND vehicle are selected', async () => {
      getAvailableVehicles.mockResolvedValue([getMockVehicle()])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })
      await waitFor(() => screen.getByText('1-A-1234'))
      fireEvent.click(screen.getByText('1-A-1234'))

      await waitFor(() => expect(screen.getByText(/Continuer/i)).not.toBeDisabled())
    })

    it('is disabled when endDate is before startDate', () => {
      const { container } = render(<RentalStep {...defaultProps} />)
      const [startInput, endInput] = getDateInputs(container)

      fireEvent.change(startInput, { target: { value: in3Days } })
      fireEvent.change(endInput,   { target: { value: today } })

      expect(screen.getByText(/Continuer/i)).toBeDisabled()
    })
  })

  // ── Date validation warning ────────────────────────────────

  describe('invalid date warning', () => {
    it('shows warning when end date is before start date', () => {
      const { container } = render(<RentalStep {...defaultProps} />)
      const [startInput, endInput] = getDateInputs(container)

      fireEvent.change(startInput, { target: { value: in3Days } })
      fireEvent.change(endInput,   { target: { value: today } })

      expect(screen.getByText(/date de fin doit être après/i)).toBeInTheDocument()
    })
  })

  // ── Duration display ───────────────────────────────────────

  describe('duration display', () => {
    it('shows — when no end date', () => {
      render(<RentalStep {...defaultProps} />)
      expect(screen.getByDisplayValue('—')).toBeInTheDocument()
    })

    it('shows correct number of days', async () => {
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })

      await waitFor(() =>
        expect(screen.getByDisplayValue(/3 day/i)).toBeInTheDocument()
      )
    })
  })

  // ── Price calculation ──────────────────────────────────────

  describe('price summary', () => {
    it('always renders Total TTC row', () => {
      render(<RentalStep {...defaultProps} />)
      expect(screen.getByText(/Total TTC/i)).toBeInTheDocument()
    })

    it('calculates TTC = (dailyRate × days) × 1.2', async () => {
      // 300 MAD/day × 3 days = 900 HT → TTC = 1080
      getAvailableVehicles.mockResolvedValue([getMockVehicle({ dailyRate: 300 })])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })
      await waitFor(() => screen.getByText('1-A-1234'))
      fireEvent.click(screen.getByText('1-A-1234'))

      await waitFor(() =>
        expect(screen.getByText('1080 MAD')).toBeInTheDocument()
      )
    })

    it('shows TVA (20%) amount', async () => {
      getAvailableVehicles.mockResolvedValue([getMockVehicle({ dailyRate: 300 })])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })
      await waitFor(() => screen.getByText('1-A-1234'))
      fireEvent.click(screen.getByText('1-A-1234'))

      // TVA = round(900 × 0.2) = 180
      await waitFor(() =>
        expect(screen.getByText('180 MAD')).toBeInTheDocument()
      )
    })
  })

  // ── Vehicle list ───────────────────────────────────────────

  describe('vehicle list', () => {
    it('fetches available vehicles when both dates are set', async () => {
      getAvailableVehicles.mockResolvedValue([getMockVehicle()])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })

      await waitFor(() => expect(getAvailableVehicles).toHaveBeenCalledWith(today, in3Days))
    })

    it('shows no-vehicles alert when list is empty and dates are set', async () => {
      getAvailableVehicles.mockResolvedValue([])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })

      await waitFor(() =>
        expect(screen.getByText(/No vehicles found/i)).toBeInTheDocument()
      )
    })

    it('shows vehicle plate and daily rate', async () => {
      getAvailableVehicles.mockResolvedValue([getMockVehicle({ plate: 'TEST-99', dailyRate: 500 })])
      const { container } = render(<RentalStep {...defaultProps} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })

      await waitFor(() => {
        expect(screen.getByText('TEST-99')).toBeInTheDocument()
        expect(screen.getByText(/500 MAD\/day/i)).toBeInTheDocument()
      })
    })
  })

  // ── onNext payload ─────────────────────────────────────────

  describe('handleNext', () => {
    it('calls onNext with correct vehicle, days, totalHT, tva, totalTTC', async () => {
      const onNext = vi.fn()
      getAvailableVehicles.mockResolvedValue([getMockVehicle({ dailyRate: 300 })])
      const { container } = render(<RentalStep {...defaultProps} onNext={onNext} />)
      const [, endInput] = getDateInputs(container)

      fireEvent.change(endInput, { target: { value: in3Days } })
      await waitFor(() => screen.getByText('1-A-1234'))
      fireEvent.click(screen.getByText('1-A-1234'))

      await waitFor(() => expect(screen.getByText(/Continuer/i)).not.toBeDisabled())
      fireEvent.click(screen.getByText(/Continuer/i))

      expect(onNext).toHaveBeenCalledOnce()
      const payload = onNext.mock.calls[0][0]
      expect(payload.days).toBe(3)
      expect(payload.totalHT).toBe(900)   // 300 × 3
      expect(payload.tva).toBe(180)       // round(900 × 0.2)
      expect(payload.totalTTC).toBe(1080) // round(900 × 1.2)
    })
  })
})
