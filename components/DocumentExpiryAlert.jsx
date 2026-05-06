import { useTranslation } from 'react-i18next'

/**
 * Modal alert displayed when an OCR-extracted document (CIN, passport,
 * or driver license) is past its expiry date.
 *
 * Two outcomes:
 *   - "Fermer" → onClose (caller cancels / stays on current step)
 *   - "Continuer" → onContinue (caller advances workflow)
 *
 * @param {Object}   props
 * @param {'cin'|'license'} props.documentType
 * @param {string}   props.expiryDate    ISO date string
 * @param {Function} props.onClose
 * @param {Function} props.onContinue
 */
export default function DocumentExpiryAlert({ documentType, expiryDate, onClose, onContinue }) {
  const { t } = useTranslation('rental')

  const docLabel = documentType === 'cin'
    ? t('expiry.cin', 'la pièce d\'identité (CIN / passeport)')
    : t('expiry.license', 'le permis de conduire')

  const formattedDate = (() => {
    try {
      return new Date(expiryDate).toLocaleDateString('fr-FR')
    } catch {
      return expiryDate
    }
  })()

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }} aria-hidden>⚠️</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--danger, #ef4444)' }}>
            {t('expiry.title', 'Document expiré')}
          </h2>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text2)', margin: '0 0 12px 0' }}>
          {t('expiry.message', 'Le document fourni ({{doc}}) a expiré le {{date}}.', {
            doc: docLabel,
            date: formattedDate,
          })}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 20px 0' }}>
          {t('expiry.hint', 'Vous pouvez fermer cette alerte ou continuer la création du contrat à vos risques.')}
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
          >
            {t('expiry.close', 'Fermer')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onContinue}
          >
            {t('expiry.continue', 'Continuer la création')}
          </button>
        </div>
      </div>
    </div>
  )
}
