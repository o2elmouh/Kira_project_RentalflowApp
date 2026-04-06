import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle, ArrowLeft, Download } from 'lucide-react'
import { updateContract, saveInvoice, saveVehicle, getFleet } from '../../lib/db'
import { computeExtraFees, daysBetween, today } from '../../utils/restitutionUtils'
import generateRestitutionPDF from './generateRestitutionPDF'
import { snapshotOnEnd } from '../../utils/snapshots'
import { api } from '../../lib/api'

export default function Step4Closure({ agency, contract, vehicle, returnDate, returnTime, returnMileage, returnFuelLevel,
  returnPhotos, damages, damageFee, onBack, onDone }) {

  const { t } = useTranslation('restitution')
  const [closing, setClosing] = useState(false)
  const [waSending, setWaSending] = useState(false)
  const [waStatus, setWaStatus] = useState(null) // 'ok' | 'err' | null

  const startDate = contract.startDate
  const realDays = daysBetween(startDate, returnDate || today())
  const { extraKm, extraKmFee, kmDriven, fuelDiff, fuelFee, totalExtraFees } =
    computeExtraFees({ vehicle, returnMileage, returnFuelLevel, contract, damageFee })
  const finalTotal = (contract.totalTTC || 0) + totalExtraFees

  const returnDamages = damages.filter(d => d.checked)

  const handleDownloadPDF = () => {
    generateRestitutionPDF({
      agency, contract, returnDate, returnTime, returnMileage, returnFuelLevel,
      returnPhotos, returnDamages, extraKmFee, fuelFee, damageFee: damageFee || 0,
      totalExtraFees, extraKm, fuelDiff,
    })
  }

  const handleSendWhatsApp = async () => {
    const phone = contract.clientPhone || ''
    if (!phone) { alert('Numéro de téléphone client introuvable.'); return }
    setWaSending(true)
    setWaStatus(null)
    try {
      const { generateRestitutionPDFBuffer } = await import('../../utils/pdf')
      const buffer = generateRestitutionPDFBuffer({
        agency, contract, returnDate, returnTime, returnMileage, returnFuelLevel,
        returnDamages, extraKmFee, fuelFee, damageFee: damageFee || 0,
        totalExtraFees, extraKm, fuelDiff,
      })
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      await api.sendRestitutionWhatsApp({
        to: phone,
        clientName: contract.clientName || '',
        contractNumber: contract.contractNumber,
        pdfBase64,
        totalExtraFees,
      })
      setWaStatus('ok')
    } catch (err) {
      console.error('[WhatsApp restitution]', err)
      setWaStatus('err')
    } finally {
      setWaSending(false)
      setTimeout(() => setWaStatus(null), 4000)
    }
  }

  const handleClose = async () => {
    setClosing(true)
    try {
      // 1. Update contract
      await updateContract({
        ...contract,
        status: 'closed',
        returnDate,
        returnMileage,
        returnFuelLevel,
        returnTime,
        returnPhotos,
        returnDamages,
        extraKmFee,
        fuelFee,
        damageFee: damageFee || 0,
        totalExtraFees,
        finalTotal,
      })

      // 2. Update vehicle status to available
      const fleet = await getFleet()
      const v = fleet.find(fv => fv.id === contract.vehicleId)
      if (v) await saveVehicle({ ...v, status: 'available' })

      // 3. Save invoice if extra fees
      if (totalExtraFees > 0) {
        const invoiceItems = [
          extraKmFee > 0 ? { label: 'Km supplémentaires', qty: extraKm, unitPrice: 2 } : null,
          fuelFee > 0 ? { label: 'Manque carburant', qty: fuelDiff, unitPrice: 100 } : null,
          (damageFee || 0) > 0 ? { label: 'Frais dommages', qty: 1, unitPrice: damageFee } : null,
        ].filter(Boolean)

        await saveInvoice({
          clientId: contract.clientId,
          clientName: contract.clientName,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          vehicleName: contract.vehicleName,
          items: invoiceItems,
          totalHT: totalExtraFees / 1.20,
          tva: totalExtraFees - totalExtraFees / 1.20,
          totalTTC: totalExtraFees,
          notes: 'Frais de restitution',
        })
      }

      // 4. Capture telemetry snapshot at rental end
      try {
        await snapshotOnEnd(contract)
      } catch (err) {
        console.warn('[Restitution] snapshotOnEnd failed:', err)
      }

      onDone()
    } catch (err) {
      console.error('[Restitution] handleClose', err)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 540, margin: '0 auto' }}>
      <div className="card-header">
        <h3 style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={18} color="#16a34a" /> {t('step4.title')}
        </h3>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Summary card */}
        <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.06em', marginBottom: 10 }}>
            {t('step4.summary')}
          </div>
          {[
            [t('step4.contract'), contract.contractNumber || '—'],
            [t('step4.client'), contract.clientName || '—'],
            [t('step4.vehicle'), contract.vehicleName || '—'],
            [t('step4.actualDuration'), `${realDays} jour(s)`],
            [t('step4.drivenKm'), `${kmDriven} km`],
            [t('step4.rentalAmount'), `${contract.totalTTC || 0} MAD`],
            [t('step4.extraFees'), `${totalExtraFees} MAD`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: 'var(--text3)' }}>{label}</span>
              <span style={{ fontWeight: 500 }}>{value}</span>
            </div>
          ))}
          <div style={{ borderTop: '2px solid var(--border)', paddingTop: 10, marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700 }}>
            <span>{t('step4.totalFinal')}</span>
            <span style={{ color: 'var(--accent)' }}>{finalTotal} MAD</span>
          </div>
        </div>

        {/* Damage summary if any */}
        {returnDamages.length > 0 && (
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', marginBottom: 6 }}>{t('step4.damagesFound')}</div>
            {returnDamages.map(d => (
              <div key={d.zone} style={{ fontSize: 12, marginBottom: 4 }}>
                <strong>{d.zone}</strong>{d.description ? `: ${d.description}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleDownloadPDF}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Download size={15} /> {t('step4.downloadPdf')}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSendWhatsApp}
            disabled={waSending}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {waSending ? '…' : waStatus === 'ok' ? '✅ PV envoyé' : waStatus === 'err' ? '❌ Échec' : '📱 Envoyer PV par WhatsApp'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleClose}
            disabled={closing}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#dc2626', borderColor: '#dc2626' }}
          >
            <CheckCircle size={15} /> {closing ? t('step4.closing') : t('step4.close')}
          </button>
        </div>

        <button className="btn btn-secondary" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, alignSelf: 'flex-start' }}>
          <ArrowLeft size={16} /> {t('nav.prev')}
        </button>
      </div>
    </div>
  )
}
