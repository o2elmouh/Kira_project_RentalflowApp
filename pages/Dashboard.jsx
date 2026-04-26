import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, Users, FileText, Receipt, TrendingUp, PlusCircle, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { getFleet, getClients, getContracts, getInvoices } from '../lib/db'
import { api } from '../lib/api.js'

function inMonth(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === year && d.getMonth() === month
}

const ICON_COLORS = {
  green:  '#4caf50',
  pink:   '#cb0c9f',
  blue:   '#3860BE',
  orange: '#CF4500',
  dark:   '#141413',
}

function StatCard({ icon: Icon, label, value, variant = 'dark', sub }) {
  const color = ICON_COLORS[variant] || '#141413'
  return (
    <div style={{
      background: '#FCFBFA',
      borderRadius: 999,
      padding: '16px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: 'rgba(0,0,0,0.04) 0px 4px 24px 0px',
      border: '1px solid rgba(0,0,0,0.05)',
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: '#F3F0EE',
        border: `1.5px solid ${color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
      }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{
          fontSize: 26,
          fontWeight: 500,
          color: '#141413',
          letterSpacing: '-0.52px',
          lineHeight: 1.1,
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
        }}>
          {value}
        </div>
        <div style={{
          fontSize: 12,
          color: '#696969',
          marginTop: 3,
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          fontWeight: 500,
        }}>
          {label}
        </div>
        {sub != null && (
          <div style={{
            fontSize: 11,
            color: '#D1CDC7',
            marginTop: 1,
            fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          }}>
            {sub}
          </div>
        )}
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
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    api.getAlerts().then(data => setAlertCount(data.length)).catch(() => {})
  }, [])

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
      <div style={{
        background: '#F3F0EE',
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}>
        <p style={{
          color: '#696969',
          fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          fontSize: 15,
        }}>
          Chargement…
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: '#F3F0EE', minHeight: '100%' }}>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>

      {/* ── Page Header ───────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '36px 40px 24px',
      }}>
        <div>
          <div className="mc-eyebrow">
            <span style={{ color: '#F37338', fontSize: 14, lineHeight: 1 }}>•</span>
            {t('title')}
          </div>
          <h2 style={{
            fontSize: 36,
            fontWeight: 500,
            color: '#141413',
            letterSpacing: '-0.72px',
            lineHeight: '44px',
            fontFamily: "'Sofia Sans', 'Inter', sans-serif",
          }}>
            {t('subtitle')}
          </h2>
        </div>
        <button className="btn-ink" onClick={() => onNav('new-rental')}>
          <PlusCircle size={15} />
          {t('newRental')}
        </button>
      </div>

      <div style={{ padding: '0 40px 48px' }}>

        {/* ── Month Navigator ────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div className="mc-month-nav">
            <button className="mc-month-nav-btn" onClick={prevMonth}>
              <ChevronLeft size={16} />
            </button>
            <div style={{
              minWidth: 170,
              textAlign: 'center',
              padding: '0 8px',
              fontFamily: "'Sofia Sans', 'Inter', sans-serif",
            }}>
              <span style={{
                fontWeight: 500,
                fontSize: 15,
                color: '#141413',
                letterSpacing: '-0.3px',
              }}>
                {months[month]} {year}
              </span>
              {isCurrentMonth && (
                <span
                  className="mc-chip mc-chip--cream"
                  style={{ marginLeft: 8, verticalAlign: 'middle' }}
                >
                  {t('thisMonth')}
                </span>
              )}
            </div>
            <button
              className="mc-month-nav-btn"
              onClick={nextMonth}
              disabled={isCurrentMonth}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {!isCurrentMonth && (
            <button
              className="btn-outline-ink"
              style={{ padding: '5px 20px', fontSize: 13 }}
              onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
            >
              {t('today')}
            </button>
          )}
        </div>

        {/* ── Stats Grid ─────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 12,
          marginBottom: 40,
        }}>
          <StatCard icon={Car}        label={t('stats.availableVehicles')} value={available}                                                     variant="green"  />
          <StatCard icon={Car}        label={t('stats.rentedVehicles')}    value={rented}                                                         variant="pink"   />
          <StatCard icon={Users}      label={t('stats.newClients')}        value={filteredClients.length}                                          variant="blue"   />
          <StatCard icon={FileText}   label={t('stats.monthContracts')}    value={filteredContracts.length} sub={t('stats.activeCount', { count: active })} variant="orange" />
          <StatCard icon={Receipt}    label={t('stats.monthInvoices')}     value={filteredInvoices.length}                                         variant="green"  />
          <StatCard icon={TrendingUp} label={t('stats.revenue')}           value={`${revenue.toLocaleString()} ${tc('currency')}`}                 variant="pink"   />
          {alertCount > 0 && (
            <div
              onClick={() => onNav('basket', { initialTab: 'alertes' })}
              style={{
                background: '#FEF0E8',
                border: '1px solid #f9c6a0',
                borderRadius: 999,
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                cursor: 'pointer',
                position: 'relative',
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                border: '1px solid rgba(207,69,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <AlertTriangle size={20} color="#CF4500" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#CF4500', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Alertes
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#CF4500', letterSpacing: '-0.5px' }}>
                  {alertCount}
                </div>
                <div style={{ fontSize: 11, color: '#CF4500', opacity: 0.8 }}>Voir →</div>
              </div>
              <div style={{
                position: 'absolute', top: 12, right: 16,
                width: 8, height: 8, borderRadius: '50%',
                background: '#CF4500',
                animation: 'pulse-dot 2s ease-in-out infinite',
              }} />
            </div>
          )}
        </div>

        {/* ── Two-column tables ──────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Contracts */}
          <div className="mc-stadium">
            <div style={{
              padding: '28px 32px 16px',
              borderBottom: '1px solid rgba(0,0,0,0.05)',
            }}>
              <div className="mc-eyebrow">
                <span style={{ color: '#F37338' }}>•</span>
                {t('contracts.title', { month: months[month] })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                  fontSize: 20,
                  fontWeight: 500,
                  color: '#141413',
                  letterSpacing: '-0.4px',
                  fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                }}>
                  Contrats du mois
                </h3>
                <span className="mc-chip mc-chip--cream">{filteredContracts.length}</span>
              </div>
            </div>
            <div style={{ padding: '8px 32px 28px' }}>
              {filteredContracts.length === 0 && (
                <p style={{
                  color: '#D1CDC7',
                  fontSize: 13,
                  padding: '20px 0',
                  fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                }}>
                  {t('contracts.empty')}
                </p>
              )}
              {filteredContracts.slice(0, 8).map(c => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                  }}
                >
                  <div>
                    <div style={{
                      fontWeight: 500,
                      color: '#141413',
                      fontSize: 13,
                      letterSpacing: '-0.26px',
                      fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                    }}>
                      {c.contractNumber}
                    </div>
                    <div style={{
                      color: '#696969',
                      fontSize: 11,
                      marginTop: 2,
                      fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                    }}>
                      {c.clientName} — {c.vehicleName}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className={`mc-chip ${c.status === 'active' ? 'mc-chip--ink' : 'mc-chip--cream'}`}>
                      {tc(`status.${c.status}`) || c.status}
                    </span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#CF4500' }}>
                      {(c.totalTTC || 0).toLocaleString()} {tc('currency')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Fleet Status */}
          <div className="mc-stadium">
            <div style={{
              padding: '28px 32px 16px',
              borderBottom: '1px solid rgba(0,0,0,0.05)',
            }}>
              <div className="mc-eyebrow">
                <span style={{ color: '#F37338' }}>•</span>
                {t('fleetStatus.title')}
              </div>
              <h3 style={{
                fontSize: 20,
                fontWeight: 500,
                color: '#141413',
                letterSpacing: '-0.4px',
                fontFamily: "'Sofia Sans', 'Inter', sans-serif",
              }}>
                Statut du parc
              </h3>
            </div>
            <div style={{ padding: '8px 32px 28px' }}>
              {fleet.slice(0, 8).map(v => (
                <div
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                  }}
                >
                  <div>
                    <div style={{
                      fontWeight: 500,
                      color: '#141413',
                      fontSize: 13,
                      letterSpacing: '-0.26px',
                      fontFamily: "'Sofia Sans', 'Inter', sans-serif",
                    }}>
                      {v.make} {v.model} {v.year}
                    </div>
                    <div style={{
                      fontFamily: 'DM Mono, monospace',
                      fontSize: 11,
                      color: '#696969',
                      marginTop: 2,
                    }}>
                      {v.plate}
                    </div>
                  </div>
                  <span className={`mc-chip ${
                    v.status === 'available' ? 'mc-chip--ink' :
                    v.status === 'rented'    ? 'mc-chip--orange' :
                                              'mc-chip--cream'
                  }`}>
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
