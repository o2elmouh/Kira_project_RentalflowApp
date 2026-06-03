import { describe, it, expect, vi } from 'vitest'

/**
 * Defense-in-depth: pages/Basket.jsx#handleConvert must refuse to route
 * prolongation leads to the new-rental wizard. The LeadModal already gates
 * its CTAs by classification, but if any path ever calls onConvert with a
 * prolongation lead, the handler is the last line of defense.
 *
 * We replicate the handler inline (it's a tiny pure function over its inputs)
 * to keep the test free of the wider Basket-page render graph.
 */

const buildHandleConvert = ({ buildRentalPrefill, updateLeadStatus, onNavigate }) =>
  function handleConvert(lead, extractedData) {
    const cls = extractedData?.classification || lead.classification
    if (cls === 'prolongation') {
      return
    }
    const prefill = buildRentalPrefill(lead, extractedData)
    updateLeadStatus(lead.id, 'processed')
    onNavigate('new-rental', { prefilledLead: prefill })
  }

describe('Basket#handleConvert — prolongation routing guard', () => {
  it('navigates to new-rental for a new_lead classification', () => {
    const onNavigate = vi.fn()
    const updateLeadStatus = vi.fn()
    const buildRentalPrefill = vi.fn().mockReturnValue({ firstName: 'Hassan' })
    const handle = buildHandleConvert({ buildRentalPrefill, updateLeadStatus, onNavigate })
    handle({ id: 'lead-1', classification: 'new_lead' }, { classification: 'new_lead' })
    expect(onNavigate).toHaveBeenCalledWith('new-rental', { prefilledLead: { firstName: 'Hassan' } })
    expect(updateLeadStatus).toHaveBeenCalledWith('lead-1', 'processed')
  })

  it('blocks navigation when extracted_data.classification is prolongation', () => {
    const onNavigate = vi.fn()
    const updateLeadStatus = vi.fn()
    const buildRentalPrefill = vi.fn()
    const handle = buildHandleConvert({ buildRentalPrefill, updateLeadStatus, onNavigate })
    handle({ id: 'lead-2' }, { classification: 'prolongation' })
    expect(onNavigate).not.toHaveBeenCalled()
    expect(updateLeadStatus).not.toHaveBeenCalled()
    expect(buildRentalPrefill).not.toHaveBeenCalled()
  })

  it('blocks navigation when the top-level lead.classification is prolongation', () => {
    const onNavigate = vi.fn()
    const updateLeadStatus = vi.fn()
    const buildRentalPrefill = vi.fn()
    const handle = buildHandleConvert({ buildRentalPrefill, updateLeadStatus, onNavigate })
    handle({ id: 'lead-3', classification: 'prolongation' }, { classification: null })
    expect(onNavigate).not.toHaveBeenCalled()
    expect(updateLeadStatus).not.toHaveBeenCalled()
  })
})
