import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { FileText } from 'lucide-react'
import { useContracts } from '../src/hooks/useContracts'
import { useClients }   from '../src/hooks/useClients'
import { useFleet }     from '../src/hooks/useFleet'
import { useAgency }    from '../src/hooks/useAgency'
import { generateContract } from '../utils/pdf'
import { api } from '../lib/api'
import { daysBetween, fmtDate, statusBadgeClass, statusLabel } from '../utils/contractFormatters'
import { acceptProlongationLeadsForContract } from '../utils/contractActions'
import ContractDetailPanel from '../components/ContractDetailPanel'
import ProlongationBanner from '../components/ProlongationBanner'

// ─────────────────────────────────────────────────────────
// CONTRACTS
// ─────────────────────────────────────────────────────────

export default function Contracts({ onRestitution }) {
  const { t } = useTranslation('contracts')
  const { data: contracts = [], isLoading: contractsLoading, invalidate: invalidateContracts } = useContracts()
  const { data: clients   = [] } = useClients()
  const { data: fleet     = [] } = useFleet()
  const { data: agency    = {} } = useAgency()
  const loading = contractsLoading
  const [selected, setSelected] = useState(null)
  const [showProlonger, setShowProlonger] = useState(false)
  const [signingUrl, setSigningUrl] = useState(null)   // string | null
  const [urlCopied, setUrlCopied] = useState(false)
  const [waContractSending, setWaContractSending]   = useState(false)
  const [waContractToast,   setWaContractToast]     = useState(null)   // 'success' | 'error' | null
  const [waPaymentSending,  setWaPaymentSending]    = useState(false)
  const [waPaymentToast,    setWaPaymentToast]      = useState(null)
  const [prolongLeadsByContract, setProlongLeadsByContract] = useState({})

  useEffect(() => {
    if (!contracts.length) return
    let cancelled = false
    const ids = contracts.map(c => c.id)
    supabase
      .from('pending_demands')
      .select('id, prolongation_target_contract_id, extracted_data, created_at')
      .eq('status', 'pending')
      .eq('classification', 'prolongation')
      .in('prolongation_target_contract_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data: leads }) => {
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
    return () => { cancelled = true }
  }, [contracts])

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
                    return (
                      <React.Fragment key={c.id}>
                      <ProlongationBanner
                        leads={prolongLeadsByContract[c.id]}
                        colSpan={9}
                        onView={() => {
                          setSelected(c.id)
                          setShowProlonger(true)
                        }}
                      />
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => { setSelected(c.id); setShowProlonger(false); setSigningUrl(null); setUrlCopied(false) }}
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
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {panelContract && (
        <ContractDetailPanel
          contract={panelContract}
          client={panelClient}
          vehicle={panelVehicle}
          agency={agency}
          showProlonger={showProlonger}
          prolongLeadsByContract={prolongLeadsByContract}
          signingUrl={signingUrl}
          setSigningUrl={setSigningUrl}
          urlCopied={urlCopied}
          setUrlCopied={setUrlCopied}
          waContractSending={waContractSending}
          waContractToast={waContractToast}
          setWaContractToast={setWaContractToast}
          waPaymentSending={waPaymentSending}
          waPaymentToast={waPaymentToast}
          setWaPaymentToast={setWaPaymentToast}
          onClose={() => { setSelected(null); setShowProlonger(false); setSigningUrl(null); setUrlCopied(false) }}
          onRestitution={onRestitution}
          onOpenProlonger={() => openProlonger(panelContract)}
          onDownloadPDF={() => downloadPDF(panelContract)}
          onSendContractWhatsApp={() => sendContractWhatsApp(panelContract)}
          onSendPaymentLinkWhatsApp={() => sendPaymentLinkWhatsApp(panelContract)}
          onCloseProlonger={() => setShowProlonger(false)}
          onProlongationConfirmed={async () => {
            await acceptProlongationLeadsForContract(panelContract.id, prolongLeadsByContract, api)
            await invalidateContracts()
            setProlongLeadsByContract(prev => {
              const next = { ...prev }
              delete next[panelContract.id]
              return next
            })
            setShowProlonger(false)
          }}
        />
      )}
    </div>
  )
}
