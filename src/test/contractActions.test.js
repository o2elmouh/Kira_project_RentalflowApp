import { describe, it, expect, vi } from 'vitest'
import { acceptProlongationLeadsForContract } from '../../utils/contractActions.js'

describe('acceptProlongationLeadsForContract', () => {
  it('calls api.updateLeadStatus once per linked lead with status=accepted', async () => {
    const api = { updateLeadStatus: vi.fn().mockResolvedValue(undefined) }
    const map = {
      'ctr-1': [{ id: 'lead-a' }, { id: 'lead-b' }],
      'ctr-2': [{ id: 'lead-c' }],
    }
    const ids = await acceptProlongationLeadsForContract('ctr-1', map, api)
    expect(ids).toEqual(['lead-a', 'lead-b'])
    expect(api.updateLeadStatus).toHaveBeenCalledTimes(2)
    expect(api.updateLeadStatus).toHaveBeenCalledWith('lead-a', 'accepted')
    expect(api.updateLeadStatus).toHaveBeenCalledWith('lead-b', 'accepted')
  })

  it('does not call the api when no leads are linked', async () => {
    const api = { updateLeadStatus: vi.fn() }
    const ids = await acceptProlongationLeadsForContract('ctr-1', {}, api)
    expect(ids).toEqual([])
    expect(api.updateLeadStatus).not.toHaveBeenCalled()
  })

  it('does not reject when one patch fails — failure is swallowed and logged', async () => {
    const api = {
      updateLeadStatus: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('rls')),
    }
    const map = { 'ctr-1': [{ id: 'lead-a' }, { id: 'lead-b' }] }
    const ids = await acceptProlongationLeadsForContract('ctr-1', map, api)
    expect(ids).toEqual(['lead-a', 'lead-b'])
    expect(api.updateLeadStatus).toHaveBeenCalledTimes(2)
  })

  it('handles null prolongLeadsByContract gracefully', async () => {
    const api = { updateLeadStatus: vi.fn() }
    const ids = await acceptProlongationLeadsForContract('ctr-1', null, api)
    expect(ids).toEqual([])
    expect(api.updateLeadStatus).not.toHaveBeenCalled()
  })
})
