import { AlertTriangle, X, ArrowRight } from 'lucide-react'

/**
 * Document mismatch confirmation modal.
 *
 * Shown when the OCR-extracted identity on the CIN/Passport scan does
 * not match the identity on the driving licence (different name, or one
 * scan is a passport while the other is a CIN — i.e. plausibly a
 * different person or the wrong file in the wrong slot).
 *
 * Manager-controlled: gives the operator a clear visual diff and lets
 * them either re-scan (Cancel) or proceed anyway (Continue) — the
 * latter logs the override into the rental for audit purposes.
 *
 * Props:
 *   cinLabel       — human label for the CIN side, e.g. "CIN" or "Passport"
 *   cinName        — extracted full name from CIN/passport scan
 *   licenseLabel   — "Permis"
 *   licenseName    — extracted full name from licence scan
 *   reason         — short message explaining why this fired
 *   onCancel       — user wants to re-scan (parent should reset state)
 *   onContinue     — user accepts and wants to proceed
 */
export default function DocumentMismatchModal({
  cinLabel = 'CIN / Passeport',
  cinName,
  licenseLabel = 'Permis',
  licenseName,
  reason,
  onCancel,
  onContinue,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div className="card" style={{ maxWidth: 460, width: '90%', padding: 24 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={18} style={{ color: '#CF4500' }} />
            Documents incohérents
          </h3>
          <button
            className="btn-outline-ink"
            style={{ padding: '4px 12px', fontSize: 13 }}
            onClick={onCancel}
            aria-label="Fermer"
          >
            <X size={14} />
          </button>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.55 }}>
          {reason || 'Les informations extraites des deux documents ne semblent pas concorder.'}
        </p>

        <div
          style={{
            background: 'var(--surface-2, #F7F5F2)',
            border: '1px solid var(--border, #E5E1DA)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 20,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <div>
            <strong>{cinLabel}:</strong>{' '}
            <span className="text-mono">{cinName || '—'}</span>
          </div>
          <div>
            <strong>{licenseLabel}:</strong>{' '}
            <span className="text-mono">{licenseName || '—'}</span>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 20 }}>
          Si vous pensez qu'il s'agit d'une erreur d'OCR ou d'orthographe, vous pouvez continuer.
          Sinon, annulez et rescannez les documents.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn-outline-ink"
            style={{ flex: 1, justifyContent: 'center', fontSize: 14, color: '#CF4500', borderColor: '#CF4500' }}
            onClick={onCancel}
          >
            <X size={14} /> Annuler — rescanner
          </button>
          <button
            className="btn-ink"
            style={{ flex: 1, justifyContent: 'center', fontSize: 14 }}
            onClick={onContinue}
          >
            Continuer <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
