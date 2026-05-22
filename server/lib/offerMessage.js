/**
 * Pure builders for outbound WhatsApp messages in the offer/acceptance flow.
 * No side effects, no I/O, fully unit-testable.
 */

const DEFAULT_PUBLIC_APP_URL = 'https://app.rentaflow.ma'

/**
 * Build the offer message body sent when the agent dispatches a smart quote.
 * @param {object} args
 * @param {string} args.vehicleName       — "Dacia Logan", "Renault Clio", etc.
 * @param {number} args.priceTotal        — MAD, integer
 * @param {string} [args.startDate]       — ISO date (YYYY-MM-DD), optional
 * @param {string} [args.endDate]         — ISO date (YYYY-MM-DD), optional
 * @param {string} [args.notes]           — free-form agent notes, optional
 * @param {string} [args.publicAppUrl]    — base URL for the privacy page link
 * @returns {string} the message body
 */
export function buildOfferMessage({ vehicleName, priceTotal, startDate, endDate, notes, publicAppUrl } = {}) {
  const baseUrl = publicAppUrl || DEFAULT_PUBLIC_APP_URL
  const lines = []

  lines.push(`Bonjour ! 🚗 Suite à votre demande, nous vous proposons une *${vehicleName}* pour *${priceTotal} MAD* au total.`)

  if (startDate && endDate) {
    lines.push(`📅 Du *${startDate}* au *${endDate}*`)
  }

  if (notes) {
    lines.push('')
    lines.push(notes)
  }

  lines.push('')
  lines.push('🔒 Vos données sont protégées (loi 09-08).')
  lines.push(`En savoir plus : ${baseUrl}/confidentialite`)
  lines.push('')
  lines.push('Êtes-vous intéressé(e) ? Répondez *Oui* pour confirmer ou *Non* pour décliner.')

  return lines.join('\n')
}

/**
 * Build the auto-acknowledgment message sent after the client accepts the offer.
 * @param {object} args
 * @param {boolean} args.needsCIN     — true when CIN photo not yet captured
 * @param {boolean} args.needsPermis  — true when permis photo not yet captured
 * @returns {string} the message body
 */
export function buildAcknowledgmentMessage({ needsCIN, needsPermis } = {}) {
  if (!needsCIN && !needsPermis) {
    return [
      'Parfait ! ✅ Nous avons tous vos documents.',
      'Nous préparons votre contrat et revenons vers vous dans quelques minutes.',
    ].join('\n')
  }

  const lines = []
  lines.push('Parfait ! ✅ Nous préparons votre contrat.')
  lines.push('')
  lines.push('Pour finaliser, merci de nous envoyer :')
  if (needsCIN)    lines.push('📄 Photo recto-verso de votre CIN')
  if (needsPermis) lines.push('🚗 Photo de votre permis de conduire')
  lines.push('')
  lines.push('Nous vous recontactons dès réception.')
  return lines.join('\n')
}
