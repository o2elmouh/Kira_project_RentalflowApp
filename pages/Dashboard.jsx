import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, Users, FileText, Receipt, TrendingUp, PlusCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { getFleet, getClients, getContracts, getInvoices } from '../lib/db'

function inMonth(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === year && d.getMonth() === month
}

function StatCard({ icon: Icon, label, value, variant = 'dark', sub }) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon ${variant}`}>
        <Icon size={22} />
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub != null && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard({ onNav }) {
  const { t } = useTranslation('dashboard')
  const { t: tc } = useTranslation('common')
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [fleet,     setFleet]     = useState([])
  const [clients,   setClients]   = useState([])
  const [contracts, setContracts] = useState([])
  const [invoices,  setInvoices]  = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [f, cl, co, inv] = await Promise.all([
          getFleet(),
          getClients(),
          getContracts(),
          getInvoices(),
        ])
        if (!cancelled) {
          setFleet(f)
          setClients(cl)
          setContracts(co)
          setInvoices(inv)
          setLoading(false)
        }
      } catch (err) {
        console.error('[Dashboard] load error', err)
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const available = fleet.filter(v => v.status === 'available').length
  const rented    = fleet.filter(v => v.status === 'rented').length

  const filteredContracts = contracts.filter(c => inMonth(c.createdAt, year, month))
  const filteredInvoices  = invoices.filter(i  => inMonth(i.createdAt, year, month))
  const filteredClients   = clients.filter(c   => inMonth(c.createdAt, year, month))

  const revenue = filteredInvoices.reduce((s, i) => s + (i.totalTTC || 0), 0)
  const active  = filteredContracts.filter(c => c.status === 'active').length

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
    if (isCurrentMonth) return
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const months = tc('months', { returnObjects: true })

  if (loading) {
    return (
      <div className="page-body">
        <p style={{ color: 'var(--text3)' }}>Chargement…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t('title')}</h2>
          <p>{t('subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNav('new-rental')}>
          <PlusCircle size={15} /> {t('newRental')}
        </button>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={prevMonth}>
            <ChevronLeft size={15} />
          </button>
          <div style={{ minWidth: 160, textAlign: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{months[month]} {year}</span>
            {isCurrentMonth && (
              <span className="badge badge-green" style={{ marginLeft: 8 }}>{t('thisMonth')}</span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={nextMonth} disabled={isCurrentMonth}>
            <ChevronRight size={15} />
          </button>
          {!isCurrentMonth && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}>
              {t('today')}
            </button>
          )}
        </div>

        <div className="stats-grid">
          <StatCard icon={Car}        label={t('stats.availableVehicles')} value={available}                        variant="green"  />
          <StatCard icon={Car}        label={t('stats.rentedVehicles')}    value={rented}                           variant="pink"   />
          <StatCard icon={Users}      label={t('stats.newClients')}        value={filteredClients.length}            variant="blue"   />
          <StatCard icon={FileText}   label={t('stats.monthContracts')}    value={filteredContracts.length}          variant="orange" sub={t('stats.activeCount', { count: active })} />
          <StatCard icon={Receipt}    label={t('stats.monthInvoices')}     value={filteredInvoices.length}           variant="green"  />
          <StatCard icon={TrendingUp} label={t('stats.revenue')}          value={`${revenue.toLocaleString()} ${tc('currency')}`} variant="pink" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 24 }}>
          <div className="card">
            <div className="card-header">
              <h3>{t('contracts.title', { month: months[month] })}</h3>
              <span className="badge badge-gray">{filteredContracts.length}</span>
            </div>
            <div className="card-body">
              {filteredContracts.length === 0 && (
                <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('contracts.empty')}</p>
              )}
              {filteredContracts.slice(0, 8).map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{c.contractNumber}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11 }}>{c.clientName} — {c.vehicleName}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <span className={`badge ${c.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                      {tc(`status.${c.status}`) || c.status}
                    </span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--accent)' }}>
                      {(c.totalTTC || 0).toLocaleString()} {tc('currency')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><h3>{t('fleetStatus.title')}</h3></div>
            <div className="card-body">
              {fleet.slice(0, 8).map(v => (
                <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{v.make} {v.model} {v.year}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>{v.plate}</div>
                  </div>
                  <span className={`badge ${v.status === 'available' ? 'badge-green' : v.status === 'rented' ? 'badge-orange' : 'badge-gray'}`}>
                    {tc(`status.${v.status}`) || v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
