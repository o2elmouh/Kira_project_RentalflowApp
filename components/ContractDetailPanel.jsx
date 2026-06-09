import React from 'react'
import { useTranslation } from 'react-i18next'
import { X, Link, Copy, Check, Download, MessageCircle, CreditCard } from 'lucide-react'
import { createSigningToken, getSigningUrl } from '../lib/signing'
import ProlongationDialog from './ProlongationDialog'
import { SectionBlock, InfoRow } from './contractPanelParts'
import { fmtDate, statusBadgeClass, statusLabel, daysBetween } from '../utils/contractFormatters'

/**
 * Side panel showing full contract details. Rendered as a fixed right-side
 * drawer with a backdrop overlay.
 *
 * All state setters live in the parent (Contracts.jsx); this component only
 * receives values and callbacks so it stays easy to test in isolation.
 */
export default function ContractDetailPanel({
  contract,
  client,
  vehicle,
  agency,
  showProlonger,
  prolongLeadsByContract,
  signingUrl,
  setSigningUrl,
  urlCopied,
  setUrlCopied,
  waContractSending,
  waContractToast,
  setWaContractToast,
  waPaymentSending,
  waPaymentToast,
  setWaPaymentToast,
  onClose,
  onRestitution,
  onOpenProlonger,
  onDownloadPDF,
  onSendContractWhatsApp,
  onSendPaymentLinkWhatsApp,
  onCloseProlonger,
  onProlongationConfirmed,
}) {
  const { t } = useTranslation('contracts')

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999 }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, height: '100vh', width: 420,
        background: 'white', zIndex: 1000, boxShadow: '-4px 0 24px rgba(0,0,0,.15)',
        overflowY: 'auto', padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>{contract.contractNumber}</div>
            <span className={`badge ${statusBadgeClass(contract.status)}`} style={{ marginTop: 4 }}>{statusLabel(contract.status, t)}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <SectionBlock title={t('panel.client')}>
          <InfoRow label={t('panel.client')} value={`${client.firstName || ''} ${client.lastName || ''}`.trim() || contract.clientName || '—'} />
          <InfoRow label={t('panel.cin')} value={client.cinNumber || '—'} />
          <InfoRow label={t('panel.phone')} value={client.phone || '—'} />
          <InfoRow label={t('panel.email')} value={client.email || '—'} />
        </SectionBlock>

        <SectionBlock title={t('panel.vehicle')}>
          <InfoRow label={t('panel.model')} value={vehicle.make ? `${vehicle.make} ${vehicle.model} (${vehicle.year})` : (contract.vehicleName || '—')} />
          <InfoRow label={t('panel.plate')} value={vehicle.plate || '—'} />
        </SectionBlock>

        <SectionBlock title={t('panel.dates')}>
          <InfoRow label={t('panel.start')} value={`${fmtDate(contract.startDate)}${contract.startTime ? ' ' + contract.startTime : ''}`} />
          <InfoRow label={t('panel.end')} value={`${fmtDate(contract.endDate)}${contract.endTime ? ' ' + contract.endTime : ''}`} />
          <InfoRow label={t('panel.duration')} value={`${contract.days || daysBetween(contract.startDate, contract.endDate)} ${t('panel.days')}`} />
        </SectionBlock>

        <SectionBlock title={t('panel.financial')}>
          <InfoRow label={t('panel.dailyRate')} value={`${vehicle.dailyRate || '—'} MAD`} />
          <InfoRow label={t('panel.numDays')} value={contract.days || daysBetween(contract.startDate, contract.endDate)} />
          <InfoRow label={t('panel.totalHT')} value={`${contract.totalHT || '—'} MAD`} />
          <InfoRow label={t('panel.vat')} value={`${contract.tva || '—'} MAD`} />
          <InfoRow label={t('panel.totalTTC')} value={`${contract.totalTTC || '—'} MAD`} isBold />
        </SectionBlock>

        <SectionBlock title={t('panel.details')}>
          <InfoRow label={t('panel.fuelLevel')} value={contract.fuelLevel || '—'} />
          <InfoRow label={t('panel.departureKm')} value={contract.mileageOut ? `${contract.mileageOut} km` : '—'} />
          <InfoRow label={t('panel.paymentMethod')} value={contract.paymentMethod || '—'} />
        </SectionBlock>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {contract.status === 'active' && !showProlonger && (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={onOpenProlonger}
            >
              {t('panel.extend')}
            </button>
          )}

          {showProlonger && (
            <ProlongationDialog
              contract={contract}
              vehicle={vehicle}
              prefilledEndDate={prolongLeadsByContract[contract.id]?.[0]?.extracted_data?.end_date || ''}
              onClose={onCloseProlonger}
              onConfirmed={onProlongationConfirmed}
            />
          )}

          {contract.status === 'active' && onRestitution && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#ea580c', borderColor: '#ea580c' }}
              onClick={() => onRestitution(contract)}
            >
              {t('panel.restitute')}
            </button>
          )}

          {/* Envoyer pour signature — only for active, unsigned contracts */}
          {contract.status === 'active' && !contract.signed && (
            <button
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => {
                const token = createSigningToken(contract.id)
                setSigningUrl(getSigningUrl(token))
                setUrlCopied(false)
              }}
            >
              <Link size={15} /> Envoyer pour signature
            </button>
          )}

          {contract.signed && (
            <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} /> Contrat signé par le client
            </div>
          )}

          {/* Signing URL box */}
          {signingUrl && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg2)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link size={13} /> Lien de signature
              </div>
              <div style={{
                fontSize: 11,
                fontFamily: 'DM Mono, monospace',
                wordBreak: 'break-all',
                background: 'var(--surface, #fff)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 8,
                color: 'var(--text2)',
                lineHeight: 1.5,
              }}>
                {signingUrl}
              </div>
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={() => {
                  navigator.clipboard.writeText(signingUrl).then(() => {
                    setUrlCopied(true)
                    setTimeout(() => setUrlCopied(false), 2500)
                  })
                }}
              >
                {urlCopied ? <><Check size={14} /> Copié !</> : <><Copy size={14} /> Copier le lien</>}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                Envoyez ce lien au client par WhatsApp ou SMS
              </p>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={onDownloadPDF}
          >
            <Download size={15} /> {t('panel.downloadPdf')}
          </button>

          {/* WhatsApp buttons — only for active or closed contracts */}
          {(contract.status === 'active' || contract.status === 'closed') && (
            <>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: '#25d366', color: '#25d366' }}
                onClick={onSendContractWhatsApp}
                disabled={waContractSending}
              >
                <MessageCircle size={15} />
                {waContractSending ? 'Envoi en cours…' : '📱 Envoyer par WhatsApp'}
              </button>

              <button
                className="btn btn-secondary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: '#0070ba', color: '#0070ba' }}
                onClick={onSendPaymentLinkWhatsApp}
                disabled={waPaymentSending}
              >
                <CreditCard size={15} />
                {waPaymentSending ? 'Envoi en cours…' : '💳 Envoyer lien de paiement CMI'}
              </button>

              {waContractToast === 'success' && (
                <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                  Contrat envoyé par WhatsApp.
                </div>
              )}
              {waContractToast === 'error' && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
                  Échec de l&apos;envoi WhatsApp. Vérifiez le numéro du client.
                </div>
              )}
              {waPaymentToast === 'success' && (
                <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                  Lien de paiement envoyé par WhatsApp.
                </div>
              )}
              {waPaymentToast === 'error' && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
                  Échec de l&apos;envoi du lien de paiement.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
