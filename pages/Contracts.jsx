import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { FileText, Download, X, Link, Copy, Check, MessageCircle, CreditCard } from 'lucide-react'
import { createSigningToken, getSigningUrl } from '../lib/signing'
import {
  getContracts,
  getFleet,
  getAgency,
} from '../lib/db'
import { generateContract } from '../utils/pdf'
import { api } from '../lib/api'
import ProlongationDialog from '../components/ProlongationDialog'

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function daysBetween(start, end) {
  if (!start || !end) return 0
  const ms = new Date(end) - new Date(start)
  return ms > 0 ? Math.round(ms / 86400000) : 0
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

function statusBadgeClass(status) {
  if (status === 'active') return 'badge-green'
  if (status === 'cancelled') return 'badge-red'
  return 'badge-gray'
}

function statusLabel(status, t) {
  if (status === 'active') return t ? t('status.active', { ns: 'common' }) : 'Actif'
  if (status === 'cancelled') return t ? t('status.cancelled', { ns: 'common' }) : 'Annulé'
  return t ? t('status.closed', { ns: 'common' }) : 'Clôturé'
}

function SectionBlock({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '.06em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value, isBold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--text3)' }}>{label}</span>
      <span style={{ fontWeight: isBold ? 700 : 400 }}>{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// CONTRACTS
// ─────────────────────────────────────────────────────────

export default function Contracts({ onRestitution }) {
  const { t } = useTranslation('contracts')
  const [contracts, setContracts] = useState([])
  const [clients, setClients] = useState([])
  const [fleet, setFleet] = useState([])
  const [agency, setAgency] = useState({})
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showProlonger, setShowProlonger] = useState(false)
  const [prolongMsg, setProlongMsg] = useState(null)
  const [signingUrl, setSigningUrl] = useState(null)   // string | null
  const [urlCopied, setUrlCopied] = useState(false)
  const [waContractSending, setWaContractSending]   = useState(false)
  const [waContractToast,   setWaContractToast]     = useState(null)   // 'success' | 'error' | null
  const [waPaymentSending,  setWaPaymentSending]    = useState(false)
  const [waPaymentToast,    setWaPaymentToast]      = useState(null)
  const [prolongLeadsByContract, setProlongLeadsByContract] = useState({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getContracts(), api.getClients(), getFleet(), getAgency()])
      .then(async ([ct, cl, fl, ag]) => {
        if (cancelled) return
        setContracts(ct)
        setClients(cl)
        setFleet(fl)
        setAgency(ag)
        setLoading(false)
        // Fetch pending prolongation leads grouped by contract id
        const ids = ct.map(c => c.id)
        if (!ids.length) return
        const { data: leads } = await supabase
          .from('pending_demands')
          .select('id, prolongation_target_contract_id, extracted_data, created_at')
          .eq('status', 'pending')
          .eq('classification', 'prolongation')
          .in('prolongation_target_contract_id', ids)
          .order('created_at', { ascending: false })
        if (cancelled) return
        const byContract = {}
        for (const l of (leads || [])) {
          const cid = l.prolongation_target_contract_id
          if (!cid) continue
          if (!byContract[cid]) byContract[cid] = []
          byContract[cid].push(l)
        }
        setProlongLeadsByContract(byContract)
      })
      .catch(err => {
        console.error('[Contracts] load error', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const getClient = (id) => clients.find(c => c.id === id) || {}
  const getVehicle = (id) => fleet.find(v => v.id === id) || {}

  const downloadPDF = async (contract) => {
    const client = getClient(contract.clientId)
    const vehicle = getVehicle(contract.vehicleId)
    await generateContract(contract, client, vehicle, agency)
  }

  const sendContractWhatsApp = async (contract) => {
    const client  = getClient(contract.clientId)
    const vehicle = getVehicle(contract.vehicleId)
    const phone   = client.phone || contract.clientPhone
    if (!phone) {
      setWaContractToast('error')
      setTimeout(() => setWaContractToast(null), 4000)
      return
    }
    setWaContractSending(true)
    setWaContractToast(null)
    try {
      const vehicleName = vehicle?.make
        ? `${vehicle.make} ${vehicle.model}`
        : (contract.vehicleName || '')

      await api.sendContractWhatsApp({
        to: phone,
        clientName: client?.firstName ? `${client.firstName} ${client.lastName}` : (contract.clientName || ''),
        contractNumber: contract.contractNumber,
        vehicleName,
        startDate: contract.startDate,
        endDate: contract.endDate,
      })
      setWaContractToast('success')
    } catch (err) {
      console.error('[WhatsApp contract]', err)
      setWaContractToast('error')
    } finally {
      setWaContractSending(false)
      setTimeout(() => setWaContractToast(null), 4000)
    }
  }

  const sendPaymentLinkWhatsApp = async (contract) => {
    const client = getClient(contract.clientId)
    const phone  = client.phone || contract.clientPhone
    if (!phone) {
      setWaPaymentToast('error')
      setTimeout(() => setWaPaymentToast(null), 4000)
      return
    }
    setWaPaymentSending(true)
    setWaPaymentToast(null)
    try {
      const merchantId = import.meta.env.VITE_CMI_MERCHANT_ID || 'DEMO'
      const paymentLink = `https://payment.cmi.co.ma/pgui/pay?merchant=${merchantId}&amount=${contract.totalTTC}&ref=${contract.contractNumber}`
      await api.sendPaymentLink({
        to: phone,
        clientName: client.firstName ? `${client.firstName} ${client.lastName}` : (contract.clientName || ''),
        contractNumber: contract.contractNumber,
        amount: contract.totalTTC,
        paymentLink,
      })
      setWaPaymentToast('success')
    } catch (err) {
      console.error('[WhatsApp payment]', err)
      setWaPaymentToast('error')
    } finally {
      setWaPaymentSending(false)
      setTimeout(() => setWaPaymentToast(null), 4000)
    }
  }

  const openProlonger = (_contract) => {
    setProlongMsg(null)
    setShowProlonger(true)
  }

  const panelContract = selected ? contracts.find(c => c.id === selected) : null
  const panelClient = panelContract ? getClient(panelContract.clientId) : {}
  const panelVehicle = panelContract ? getVehicle(panelContract.vehicleId) : {}

  if (loading) {
    return (
      <div>
        <div className="page-header"><div><h2>{t('title')}</h2></div></div>
        <div className="page-body"><p style={{ color: 'var(--text3)', fontSize: 13, padding: 16 }}>Chargement…</p></div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('count', { count: contracts.length })}</p>
        </div>
      </div>
      <div className="page-body">
        <div className="card">
          <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
            {contracts.length === 0 ? (
              <p style={{ color: 'var(--text3)', fontSize: 13, padding: 16 }}>{t('empty')}</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
                    {[t('headers.number'), t('headers.client'), t('headers.vehicle'), t('headers.startDate'), t('headers.endDate'), t('headers.duration'), t('headers.totalTTC'), t('headers.status'), t('headers.pdf')].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => {
                    const cl = getClient(c.clientId)
                    const ve = getVehicle(c.vehicleId)
                    const days = c.days || daysBetween(c.startDate, c.endDate)
                    const pendingLeads = prolongLeadsByContract[c.id]
                    return (
                      <>
                      {pendingLeads?.length > 0 && (
                        <tr key={`banner-${c.id}`} style={{ background: 'rgba(59,130,246,0.04)' }}>
                          <td colSpan={9} style={{ padding: '6px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'rgba(59,130,246,0.08)', borderRadius: 6, border: '1px solid rgba(59,130,246,0.2)', fontSize: 12, color: '#2563eb' }}>
                              <span>
                                🔔 {t('panel.prolongationRequestedUntil', {
                                  defaultValue: 'Prolongation demandée jusqu\'au {{date}}',
                                  date: pendingLeads[0].extracted_data?.end_date,
                                })}
                                {pendingLeads.length > 1 && (
                                  <span style={{ marginLeft: 8, opacity: 0.7 }}>
                                    {t('panel.prolongationOther', {
                                      defaultValue: '+{{count}} autres',
                                      count: pendingLeads.length - 1,
                                    })}
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelected(c.id)
                                  setShowProlonger(true)
                                }}
                                style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', fontSize: 11, cursor: 'pointer' }}
                              >
                                {t('panel.prolongationView', { defaultValue: 'Voir' })} →
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => { setSelected(c.id); setShowProlonger(false); setProlongMsg(null); setSigningUrl(null); setUrlCopied(false) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600, textDecoration: 'underline', padding: 0 }}
                          >
                            {c.contractNumber}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {cl.firstName ? `${cl.firstName} ${cl.lastName}` : (c.clientName || '—')}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {ve.make ? `${ve.make} ${ve.model}` : (c.vehicleName || '—')}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(c.startDate)}</td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(c.endDate)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>{days} {t('daysSuffix')}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, fontWeight: 600 }}>{(c.totalTTC || 0).toLocaleString('fr-MA')} MAD</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`badge ${statusBadgeClass(c.status)}`}>{statusLabel(c.status, t)}</span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                            onClick={() => downloadPDF(c)}
                            title={t('downloadPdf')}
                          >
                            <FileText size={13} />
                          </button>
                        </td>
                      </tr>
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Side panel overlay */}
      {panelContract && (
        <>
          <div
            onClick={() => { setSelected(null); setShowProlonger(false); setProlongMsg(null); setSigningUrl(null); setUrlCopied(false) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999 }}
          />
          <div style={{
            position: 'fixed', right: 0, top: 0, height: '100vh', width: 420,
            background: 'white', zIndex: 1000, boxShadow: '-4px 0 24px rgba(0,0,0,.15)',
            overflowY: 'auto', padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>{panelContract.contractNumber}</div>
                <span className={`badge ${statusBadgeClass(panelContract.status)}`} style={{ marginTop: 4 }}>{statusLabel(panelContract.status, t)}</span>
              </div>
              <button onClick={() => { setSelected(null); setShowProlonger(false); setProlongMsg(null); setSigningUrl(null); setUrlCopied(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <SectionBlock title={t('panel.client')}>
              <InfoRow label={t('panel.client')} value={`${panelClient.firstName || ''} ${panelClient.lastName || ''}`.trim() || panelContract.clientName || '—'} />
              <InfoRow label={t('panel.cin')} value={panelClient.cinNumber || '—'} />
              <InfoRow label={t('panel.phone')} value={panelClient.phone || '—'} />
              <InfoRow label={t('panel.email')} value={panelClient.email || '—'} />
            </SectionBlock>

            <SectionBlock title={t('panel.vehicle')}>
              <InfoRow label={t('panel.model')} value={panelVehicle.make ? `${panelVehicle.make} ${panelVehicle.model} (${panelVehicle.year})` : (panelContract.vehicleName || '—')} />
              <InfoRow label={t('panel.plate')} value={panelVehicle.plate || '—'} />
            </SectionBlock>

            <SectionBlock title={t('panel.dates')}>
              <InfoRow label={t('panel.start')} value={`${fmtDate(panelContract.startDate)}${panelContract.startTime ? ' ' + panelContract.startTime : ''}`} />
              <InfoRow label={t('panel.end')} value={`${fmtDate(panelContract.endDate)}${panelContract.endTime ? ' ' + panelContract.endTime : ''}`} />
              <InfoRow label={t('panel.duration')} value={`${panelContract.days || daysBetween(panelContract.startDate, panelContract.endDate)} ${t('panel.days')}`} />
            </SectionBlock>

            <SectionBlock title={t('panel.financial')}>
              <InfoRow label={t('panel.dailyRate')} value={`${panelVehicle.dailyRate || '—'} MAD`} />
              <InfoRow label={t('panel.numDays')} value={panelContract.days || daysBetween(panelContract.startDate, panelContract.endDate)} />
              <InfoRow label={t('panel.totalHT')} value={`${panelContract.totalHT || '—'} MAD`} />
              <InfoRow label={t('panel.vat')} value={`${panelContract.tva || '—'} MAD`} />
              <InfoRow label={t('panel.totalTTC')} value={`${panelContract.totalTTC || '—'} MAD`} isBold />
            </SectionBlock>

            <SectionBlock title={t('panel.details')}>
              <InfoRow label={t('panel.fuelLevel')} value={panelContract.fuelLevel || '—'} />
              <InfoRow label={t('panel.departureKm')} value={panelContract.mileageOut ? `${panelContract.mileageOut} km` : '—'} />
              <InfoRow label={t('panel.paymentMethod')} value={panelContract.paymentMethod || '—'} />
            </SectionBlock>

            <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {panelContract.status === 'active' && !showProlonger && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => openProlonger(panelContract)}
                >
                  {t('panel.extend')}
                </button>
              )}
              {prolongMsg && (
                <div style={{ padding: '8px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                  {prolongMsg}
                </div>
              )}
              {showProlonger && panelContract && (
                <ProlongationDialog
                  contract={panelContract}
                  vehicle={panelVehicle}
                  prefilledEndDate={prolongLeadsByContract[panelContract.id]?.[0]?.extracted_data?.end_date || ''}
                  onClose={() => setShowProlonger(false)}
                  onConfirmed={async () => {
                    const linked = prolongLeadsByContract[panelContract.id] || []
                    if (linked.length) {
                      await supabase
                        .from('pending_demands')
                        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                        .in('id', linked.map(l => l.id))
                    }
                    const refreshed = await getContracts()
                    setContracts(refreshed)
                    setProlongLeadsByContract({})
                    setShowProlonger(false)
                  }}
                />
              )}
              {panelContract.status === 'active' && onRestitution && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#ea580c', borderColor: '#ea580c' }}
                  onClick={() => { setSelected(null); onRestitution(panelContract) }}
                >
                  {t('panel.restitute')}
                </button>
              )}
              {/* Envoyer pour signature — only for active, unsigned contracts */}
              {panelContract.status === 'active' && !panelContract.signed && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={() => {
                    const token = createSigningToken(panelContract.id)
                    setSigningUrl(getSigningUrl(token))
                    setUrlCopied(false)
                  }}
                >
                  <Link size={15} /> Envoyer pour signature
                </button>
              )}
              {panelContract.signed && (
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
                onClick={() => downloadPDF(panelContract)}
              >
                <Download size={15} /> {t('panel.downloadPdf')}
              </button>

              {/* WhatsApp buttons — only for active or closed contracts */}
              {(panelContract.status === 'active' || panelContract.status === 'closed') && (
                <>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: '#25d366', color: '#25d366' }}
                    onClick={() => sendContractWhatsApp(panelContract)}
                    disabled={waContractSending}
                  >
                    <MessageCircle size={15} />
                    {waContractSending ? 'Envoi en cours…' : '📱 Envoyer par WhatsApp'}
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: '#0070ba', color: '#0070ba' }}
                    onClick={() => sendPaymentLinkWhatsApp(panelContract)}
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
      )}
    </div>
  )
}
