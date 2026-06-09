import { useContext, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { api } from '../../lib/api.js'
import { UserContext } from '../../lib/UserContext.js'

export default function PrivacyTab() {
  const { t } = useTranslation('settings')
  const { profile } = useContext(UserContext)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)   // { clientId, name }
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState(null)
  // Retention period (Phase 4) — controls the monthly auto-anonymization cron.
  const [retentionYears, setRetentionYears] = useState(10)
  const [retentionDirty, setRetentionDirty] = useState(false)
  const [retentionSaving, setRetentionSaving] = useState(false)
  const [retentionFeedback, setRetentionFeedback] = useState(null) // 'saved' | 'error' | null

  useEffect(() => {
    if (!profile?.agency_id) return
    supabase
      .from('clients')
      .select('id, first_name, last_name, phone, email, anonymized_at')
      .eq('agency_id', profile.agency_id)
      .order('last_name')
      .then(({ data }) => { setClients(data || []); setLoading(false) })

    supabase
      .from('agencies')
      .select('retention_years')
      .eq('id', profile.agency_id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.retention_years != null) setRetentionYears(data.retention_years)
      })
  }, [profile?.agency_id])

  async function handleSaveRetention() {
    setRetentionSaving(true)
    setRetentionFeedback(null)
    try {
      await api.updateAgency({ retention_years: Number(retentionYears) })
      setRetentionDirty(false)
      setRetentionFeedback('saved')
      setTimeout(() => setRetentionFeedback(null), 2500)
    } catch {
      setRetentionFeedback('error')
    } finally {
      setRetentionSaving(false)
    }
  }

  async function handleAnonymize() {
    setSubmitting(true)
    setModalError(null)
    try {
      await api.anonymizeClient(modal.clientId, reason)
      setClients(prev => prev.map(c =>
        c.id === modal.clientId
          ? { ...c, first_name: '[ANONYMIZED]', last_name: '[ANONYMIZED]', email: null, phone: null, anonymized_at: new Date().toISOString() }
          : c
      ))
      setModal(null)
      setReason('')
    } catch (err) {
      console.error('[anonymize] failed:', err)
      setModalError(err?.message || 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  if (profile?.role !== 'admin') {
    return <p style={{ color: 'var(--text2)', padding: 20 }}>{t('privacy.adminOnly')}</p>
  }

  if (loading) return <p style={{ color: 'var(--text2)', padding: 20 }}>{t('privacy.loading')}</p>

  return (
    <div>
      <h3 style={{ marginBottom: 8, color: 'var(--ink)' }}>{t('privacy.title')}</h3>
      <p style={{ color: 'var(--text2)', marginBottom: 24, fontSize: 14 }}>{t('privacy.description')}</p>

      {/* Retention period — drives the monthly auto-anonymization cron */}
      <div style={{
        padding: '14px 16px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface)',
        marginBottom: 28,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          {t('privacy.retentionTitle', 'Période de conservation')}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, lineHeight: 1.5 }}>
          {t('privacy.retentionDesc', 'Les fiches clients dont tous les contrats sont clôturés depuis plus longtemps que cette période seront anonymisées automatiquement chaque mois (loi 09-08 / comptabilité marocaine).')}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="number"
            min={5}
            max={30}
            value={retentionYears}
            onChange={e => {
              setRetentionYears(e.target.value)
              setRetentionDirty(true)
              setRetentionFeedback(null)
            }}
            style={{
              width: 70,
              padding: '6px 8px',
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              fontFamily: 'DM Mono, monospace',
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {t('privacy.retentionYears', 'années (min. 5, max. 30)')}
          </span>
          <button
            type="button"
            onClick={handleSaveRetention}
            disabled={!retentionDirty || retentionSaving}
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 4,
              border: '1px solid var(--ink)',
              background: retentionDirty && !retentionSaving ? 'var(--ink)' : 'var(--border)',
              color: retentionDirty && !retentionSaving ? '#fff' : 'var(--text2)',
              cursor: retentionDirty && !retentionSaving ? 'pointer' : 'default',
            }}
          >
            {retentionSaving ? t('privacy.retentionSaving', 'Enregistrement…') : t('privacy.retentionSave', 'Enregistrer')}
          </button>
          {retentionFeedback === 'saved' && (
            <span style={{ fontSize: 12, color: 'var(--success, #22c55e)' }}>
              {t('privacy.retentionSaved', 'Enregistré')}
            </span>
          )}
          {retentionFeedback === 'error' && (
            <span style={{ fontSize: 12, color: 'var(--danger, #ef4444)' }}>
              {t('privacy.retentionError', 'Erreur')}
            </span>
          )}
        </div>
      </div>

      {clients.length === 0 ? (
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>{t('privacy.empty')}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[t('privacy.colName'), t('privacy.colContact'), t('privacy.colStatus'), ''].map((h, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                  {c.anonymized_at
                    ? <span style={{ color: 'var(--text2)', fontStyle: 'italic' }}>[Client anonymisé]</span>
                    : `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—'}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>
                  {c.anonymized_at ? '—' : (c.phone || c.email || '—')}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {c.anonymized_at
                    ? <span style={{ color: 'var(--success, #22c55e)', fontSize: 12, fontWeight: 600 }}>{t('privacy.anonymized')}</span>
                    : <span style={{ color: 'var(--text2)', fontSize: 12 }}>{t('privacy.active')}</span>}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  {!c.anonymized_at && (
                    <button
                      onClick={() => setModal({ clientId: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() })}
                      style={{ fontSize: 12, padding: '4px 12px', borderRadius: 4, border: '1px solid var(--danger, #ef4444)', color: 'var(--danger, #ef4444)', background: 'none', cursor: 'pointer' }}
                    >
                      {t('privacy.anonymizeBtn')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 28, width: 420, maxWidth: '90vw', boxShadow: 'var(--shadow-card)' }}>
            <h4 style={{ marginBottom: 12, color: 'var(--ink)' }}>{t('privacy.modalTitle')}</h4>
            <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>
              {t('privacy.modalDesc', { name: modal.name })}
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t('privacy.reasonPlaceholder')}
              style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            {modalError && (
              <div style={{
                marginTop: 12,
                padding: '8px 10px',
                borderRadius: 4,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid var(--danger, #ef4444)',
                color: 'var(--danger, #ef4444)',
                fontSize: 12,
                lineHeight: 1.4,
                wordBreak: 'break-word',
              }}>
                {modalError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => { setModal(null); setReason(''); setModalError(null) }}
                style={{ padding: '7px 18px', borderRadius: 4, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13 }}
              >
                {t('privacy.cancel')}
              </button>
              <button
                onClick={handleAnonymize}
                disabled={submitting}
                style={{ padding: '7px 18px', borderRadius: 4, border: 'none', background: 'var(--danger, #ef4444)', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, opacity: submitting ? 0.7 : 1 }}
              >
                {submitting ? t('privacy.anonymizing') : t('privacy.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
