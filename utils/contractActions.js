/**
 * Side-effect helpers for the contracts page. Kept slim so they're cheap to
 * test in isolation.
 */

/**
 * Accept all pending prolongation leads linked to a single contract by
 * patching their status to 'accepted' via the backend API. Resolves once
 * every patch settles (failures are logged but do not reject the outer
 * promise — the contract update itself already succeeded).
 *
 * @param {string} contractId
 * @param {Record<string, Array<{id: string}>>} prolongLeadsByContract
 * @param {{ updateLeadStatus: (id: string, status: string) => Promise<unknown> }} api
 * @returns {Promise<Array<string>>} ids of leads that were targeted (regardless of patch success)
 */
export async function acceptProlongationLeadsForContract(contractId, prolongLeadsByContract, api) {
  const linked = prolongLeadsByContract?.[contractId] || []
  if (!linked.length) return []
  const ids = linked.map(l => l.id)
  await Promise.all(ids.map(id =>
    api.updateLeadStatus(id, 'accepted').catch(err => {
      console.error('[contractActions] failed to patch prolongation lead', id, err)
    })
  ))
  return ids
}
