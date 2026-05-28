import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateContract, saveInvoice, updateInvoice, getInvoices } from '../lib/db'

const daysBetween = (start, end) => {
  if (!start || !end) return 0
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

/**
 * Reusable prolongation dialog. Used by:
 *   - the contract panel in pages/Contracts.jsx (existing manual flow)
 *   - the prolongation corbeille card in components/LeadModal.jsx (Phase 4)
 *   - the prolongation banner on contract cards (Phase 4)
 *
 * On confirm: extends the contract via direct DB write (mirrors existing
 * behavior, not the unused backend /extend endpoint) and creates/updates
 * an invoice for the extra days.
 */
export default function ProlongationDialog({
  contract,
  vehicle,
  prefilledEndDate = '',
  onClose,
  onConfirmed,
}) {
  const { t } = useTranslation('contracts')
  const [newEndDate, setNewEndDate] = useState(prefilledEndDate || '')
  const [newDailyRate, setNewDailyRate] = useState(
    contract?.dailyRate || vehicle?.dailyRate || ''
  )
  const [msg, setMsg] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const { extra, amount } = useMemo(() => {
    const e = daysBetween(contract?.endDate, newEndDate)
    const a = e * Number(newDailyRate || 0)
    return { extra: e, amount: a }
  }, [contract?.endDate, newEndDate, newDailyRate])

  const handleConfirm = async () => {
    if (!newEndDate || extra <= 0) return
    setSubmitting(true)
    setMsg(null)
    try {
      const rate = Number(newDailyRate)
      const extraAmount = extra * rate
      const newTotalTTC = (Number(contract.totalTTC) || 0) + extraAmount
      const newTotalHT = newTotalTTC / 1.20
      const newTva = newTotalTTC - newTotalHT
      const updated = {
        ...contract,
        endDate: newEndDate,
        days: (contract.days || daysBetween(contract.startDate, contract.endDate)) + extra,
        totalTTC: Math.round(newTotalTTC * 100) / 100,
        totalHT: Math.round(newTotalHT * 100) / 100,
        tva: Math.round(newTva * 100) / 100,
      }
      await updateContract(updated)

      const originalRate = Number(contract.dailyRate) || 0
      const rateChanged = rate !== originalRate && originalRate > 0
      if (rateChanged) {
        await saveInvoice({
          clientId: contract.clientId,
          clientName: contract.clientName,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          vehicleName: contract.vehicleName,
          items: [{ label: `Prolongation ${extra} jour(s)`, qty: extra, unitPrice: rate }],
          totalHT: Math.round((extraAmount / 1.20) * 100) / 100,
          tva: Math.round((extraAmount - extraAmount / 1.20) * 100) / 100,
          totalTTC: Math.round(extraAmount * 100) / 100,
          notes: 'Facture de prolongation',
        })
        setMsg(t('panel.extendSuccess', { defaultValue: 'Prolongation enregistrée.' }))
      } else {
        const invoices = await getInvoices()
        const existing = invoices.find(i => i.contractId === contract.id)
        if (existing) {
          await updateInvoice({
            ...existing,
            totalTTC: Math.round(((existing.totalTTC || 0) + extraAmount) * 100) / 100,
            totalHT: Math.round(((existing.totalHT || 0) + extraAmount / 1.20) * 100) / 100,
            tva: Math.round(((existing.tva || 0) + extraAmount - extraAmount / 1.20) * 100) / 100,
          })
        }
        setMsg(t('panel.extendSuccessUpdated', { defaultValue: 'Prolongation enregistrée (facture mise à jour).' }))
      }

      if (onConfirmed) onConfirmed(updated)
      if (onClose) onClose()
    } catch (err) {
      console.error('[ProlongationDialog] confirm error:', err)
      setMsg(t('panel.extendError', { defaultValue: 'Erreur lors de la prolongation. Veuillez réessayer.' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>
        {t('panel.prolongationTitle', { defaultValue: 'Prolonger le contrat' })}
      </div>

      <label style={{ display: 'block', marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {t('panel.newEndDate', { defaultValue: 'Nouvelle date de fin' })}
        </div>
        <input
          type="date"
          aria-label="Nouvelle date de fin"
          value={newEndDate}
          onChange={(e) => setNewEndDate(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
          {t('panel.dailyRate', { defaultValue: 'Tarif journalier (MAD)' })}
        </div>
        <input
          type="number"
          aria-label="Tarif journalier"
          value={newDailyRate}
          onChange={(e) => setNewDailyRate(e.target.value)}
          style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}
        />
      </label>

      {extra > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Prolongation : {extra} jour{extra > 1 ? 's' : ''} · +{amount} MAD
        </div>
      )}

      {msg && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{msg}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}
        >
          {t('panel.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting || extra <= 0 || !newDailyRate}
          style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
        >
          {submitting
            ? t('panel.confirming', { defaultValue: 'Confirmation…' })
            : t('panel.confirmProlongation', { defaultValue: 'Confirmer la prolongation' })}
        </button>
      </div>
    </div>
  )
}
