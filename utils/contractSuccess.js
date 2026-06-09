/**
 * Helpers for the post-finalization ContractSuccess page.
 *
 * Two real-world finalization flows converge on this page:
 *   1. Electronic signature: client signed via magic link → backend uploaded a
 *      signed PDF → `signed_pdf_path` (and `signed_at`) populated.
 *   2. In-person signature: agency clicked "Finaliser" at the desk to lock the
 *      case before printing for paper signature → only `finalized_at` is set;
 *      no signed PDF exists and none will ever be generated.
 *
 * The UI must speak truth for both. This helper picks the heading + subline
 * copy from the contract row.
 */

/**
 * @param {{ signedAt?: string|null, signed_at?: string|null }} contract
 * @returns {{ heading: string, subline: string, signed: boolean }}
 */
export function describeSignatureState(contract) {
  const signedAt = contract?.signedAt || contract?.signed_at || null
  if (signedAt) {
    return {
      signed: true,
      heading: 'Contrat signé',
      subline: `Le client a signé le contrat le ${new Date(signedAt).toLocaleString('fr-FR')}.`,
    }
  }
  return {
    signed: false,
    heading: 'Contrat finalisé',
    subline: 'Prêt à imprimer pour signature en agence.',
  }
}
