import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit2 } from 'lucide-react'
import {
  getAgency, saveAgency,
  getFleetConfig, saveFleetConfig,
  getGeneralConfig, saveGeneralConfig,
  resetFleetConfig,
} from '../lib/db'
import { api } from '../lib/api'
import { useIsAdmin } from '../lib/UserContext'

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

const SETTINGS_TABS_KEYS = [
  { id: 'agence',  key: 'tabs.agency' },
  { id: 'parc',    key: 'tabs.fleetConfig' },
  { id: 'general', key: 'tabs.general' },
  { id: 'equipe',  key: 'tabs.team' },
]

const DEFAULT_OPTIONS = [
  { id: 'cdw', name: 'CDW — Collision Damage Waiver', pricingType: 'per_day', price: 80, enabled: true },
  { id: 'pai', name: 'PAI — Protection Accident Individuel', pricingType: 'per_day', price: 40, enabled: true },
]

const FLEET_CONFIG_COLS = [
  { key: 'make',             label: 'Marque',                     type: 'text' },
  { key: 'warrantyGeneral',  label: 'Garantie générale',          type: 'text' },
  { key: 'warrantyYears',    label: 'Durée (ans)',                type: 'number' },
  { key: 'warrantyBattery',  label: 'Garantie batterie',          type: 'text' },
  { key: 'controlTechYears', label: 'Contrôle technique (ans)',   type: 'number' },
  { key: 'vidangeKm',        label: 'Vidange (km)',               type: 'number' },
  { key: 'courroieKm',       label: 'Courroie distribution (km)', type: 'number' },
  { key: 'extension',        label: 'Extension possible',         type: 'text' },
]

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

function AgenceTab() {
  const [agency, setAgency] = useState({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAgency().then(ag => {
      if (cancelled) return
      setAgency(ag)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const save = async () => {
    await saveAgency(agency)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = (label, key, placeholder = '') => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        value={agency[key] || ''}
        placeholder={placeholder}
        onChange={e => setAgency(p => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  )

  if (loading) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</p>

  return (
    <>
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="card-header">
          <h3>Informations générales</h3>
          {saved && <span className="badge badge-green">Enregistré</span>}
        </div>
        <div className="card-body">
          <div className="form-row cols-2">
            {field('Nom de l\'agence', 'name', 'Ex: Location Auto Maroc')}
            {field('Ville', 'city', 'Ex: Casablanca')}
          </div>
          <div className="form-row cols-2">
            {field('Adresse', 'address', 'Ex: 12 Rue des Fleurs, Casablanca')}
            {field('Téléphone', 'phone', 'Ex: +212 6XX XXX XXX')}
          </div>
          <div className="form-row cols-1">
            {field('Email de l\'agence', 'email', 'Ex: contact@agence.ma')}
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: 16 }}>
        <div className="card-header">
          <h3>Identifiants fiscaux &amp; légaux</h3>
        </div>
        <div className="card-body">
          <div className="form-row cols-2">
            {field('ICE', 'ice', 'Identifiant Commun de l\'Entreprise')}
            {field('RC', 'rc', 'Registre de Commerce')}
          </div>
          <div className="form-row cols-2">
            {field('IF — Identifiant Fiscal', 'if_number', 'Ex: 12345678')}
            {field('Patente', 'patente', 'Numéro de patente')}
          </div>
          <div className="form-row cols-1">
            {field('N° Police d\'assurance', 'insurance_policy', 'Ex: ASS-2024-00123')}
          </div>
          <button className="btn btn-primary mt-2" onClick={save}>Enregistrer les paramètres</button>
        </div>
      </div>
    </>
  )
}

function RentalOptionsSection() {
  const loadOptions = () => {
    const cfg = getGeneralConfig()
    return cfg.rentalOptions && cfg.rentalOptions.length > 0 ? cfg.rentalOptions : DEFAULT_OPTIONS
  }
  const [options, setOptions] = useState(loadOptions)
  const [saved, setSaved] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const PROTECTED = ['cdw', 'pai']

  const update = (id, field, value) => {
    setOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o))
    setSaved(false)
  }

  const addOption = () => {
    const newId = 'opt_' + Date.now()
    setOptions(prev => [...prev, { id: newId, name: '', pricingType: 'per_day', price: 0, enabled: true }])
  }

  const removeOption = (id) => {
    setOptions(prev => prev.filter(o => o.id !== id))
  }

  const save = () => {
    const cfg = getGeneralConfig()
    saveGeneralConfig({ ...cfg, rentalOptions: options })
    setSaved(true)
    setEditMode(false)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card" style={{ maxWidth: 780 }}>
      <div className="card-header">
        <h3>Options de location</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saved && <span className="badge badge-green">Enregistré</span>}
          {!editMode && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>Modifier</button>
          )}
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {options.map(opt => (
            <div key={opt.id} style={{ display: 'grid', gridTemplateColumns: `36px 1fr 130px 90px${editMode && !PROTECTED.includes(opt.id) ? ' 36px' : ''}`, gap: 8, alignItems: 'center', background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px' }}>
              <input
                type="checkbox"
                checked={opt.enabled}
                onChange={e => update(opt.id, 'enabled', e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <input
                className="form-input"
                style={{ fontSize: 13, padding: '5px 8px', minWidth: 0 }}
                value={opt.name}
                placeholder="Nom de l'option"
                readOnly={!editMode}
                onChange={e => update(opt.id, 'name', e.target.value)}
              />
              <select
                className="form-select"
                style={{ fontSize: 12, padding: '5px 8px' }}
                value={opt.pricingType}
                disabled={!editMode}
                onChange={e => update(opt.id, 'pricingType', e.target.value)}
              >
                <option value="per_day">Par jour</option>
                <option value="fixed">Fixe</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                <input
                  className="form-input text-mono"
                  style={{ fontSize: 13, padding: '5px 8px', width: 0, flex: 1, minWidth: 0 }}
                  type="number"
                  min="0"
                  readOnly={!editMode}
                  value={opt.price}
                  onChange={e => update(opt.id, 'price', Number(e.target.value))}
                />
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>MAD</span>
              </div>
              {editMode && !PROTECTED.includes(opt.id) && (
                <button
                  onClick={() => removeOption(opt.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#ef4444', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Supprimer"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
        {editMode && (
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={addOption}>
              + Ajouter une option
            </button>
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save}>
              Enregistrer
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => { setOptions(loadOptions()); setEditMode(false) }}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SignatureSection() {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [savedSig, setSavedSig] = useState(() => getGeneralConfig().defaultSignature || null)
  const [editMode, setEditMode] = useState(!getGeneralConfig().defaultSignature)
  const [saveFeedback, setSaveFeedback] = useState(false)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setDrawing(true)
  }

  const draw = (e) => {
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1c1a16'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const stopDraw = () => setDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }

  const saveSig = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    const cfg = getGeneralConfig()
    saveGeneralConfig({ ...cfg, defaultSignature: dataUrl })
    setSavedSig(dataUrl)
    setEditMode(false)
    setSaveFeedback(true)
    setTimeout(() => setSaveFeedback(false), 2000)
  }

  const startEdit = () => {
    setEditMode(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }, 50)
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <div className="card-header">
        <h3>Signature par défaut</h3>
        {saveFeedback && <span className="badge badge-green">Enregistrée</span>}
      </div>
      <div className="card-body">
        {!editMode && savedSig ? (
          <div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', display: 'inline-block', marginBottom: 12 }}>
              <img src={savedSig} alt="Signature enregistrée" style={{ display: 'block', maxWidth: 400 }} />
            </div>
            <div>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={startEdit}>
                Modifier la signature
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
              Dessinez votre signature ci-dessous :
            </div>
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              style={{ border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'crosshair', touchAction: 'none', display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={clearCanvas}>
                Effacer
              </button>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={saveSig}>
                Enregistrer la signature
              </button>
              {savedSig && (
                <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => setEditMode(false)}>
                  Annuler
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GeneralConfigTab() {
  const [activeSection, setActiveSection] = useState('options')

  const sections = [
    { id: 'options',    label: 'Options de location' },
    { id: 'signature',  label: 'Signature par défaut' },
    { id: 'params',     label: 'Paramètres' },
  ]

  return (
    <div>
      {/* Tabs horizontaux */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: activeSection === s.id ? 700 : 400,
              color: activeSection === s.id ? 'var(--accent)' : 'var(--text2)',
              borderBottom: activeSection === s.id ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              transition: 'color .15s',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'options' && <RentalOptionsSection />}
      {activeSection === 'signature' && <SignatureSection />}
      {activeSection === 'params' && (
        <div className="card" style={{ maxWidth: 680 }}>
          <div className="card-header"><h3>Paramètres généraux</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text3)' }}>
              D'autres paramètres généraux seront ajoutés ici prochainement.
            </p>
            <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg2)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8 }}>
              <span>ℹ️</span>
              <span>La limite kilométrique est désormais configurable par véhicule dans la fiche de chaque voiture (onglet Flotte).</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FleetConfigTab() {
  const [config, setConfig] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRow, setEditRow] = useState(null)
  const [editData, setEditData] = useState({})
  const [savedRow, setSavedRow] = useState(null)

  useEffect(() => {
    let cancelled = false
    getFleetConfig().then(data => {
      if (cancelled) return
      setConfig(data)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const startEditRow = (i) => {
    setEditRow(i)
    setEditData({ ...config[i] })
  }

  const saveRow = async (i) => {
    const updated = config.map((r, idx) => idx === i ? { ...editData } : r)
    setConfig(updated)
    await saveFleetConfig(updated)
    setEditRow(null)
    setSavedRow(i)
    setTimeout(() => setSavedRow(null), 1500)
  }

  const handleReset = () => {
    if (!window.confirm('Réinitialiser la configuration parc aux valeurs par défaut ?')) return
    const defaults = resetFleetConfig()
    setConfig(defaults)
    setEditRow(null)
  }

  if (loading) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>Chargement…</p>

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Configuration parc</h3>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={handleReset}>
          Réinitialiser les valeurs par défaut
        </button>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', borderBottom: '2px solid var(--border)' }}>
              {FLEET_CONFIG_COLS.map(col => (
                <th key={col.key} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{col.label}</th>
              ))}
              <th style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {config.map((row, i) => {
              const isEditing = editRow === i
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: isEditing ? 'var(--bg2)' : undefined }}>
                  {FLEET_CONFIG_COLS.map(col => (
                    <td key={col.key} style={{ padding: '8px 12px' }}>
                      {isEditing ? (
                        col.type === 'boolean' ? (
                          <input
                            type="checkbox"
                            checked={!!editData[col.key]}
                            onChange={e => setEditData(p => ({ ...p, [col.key]: e.target.checked }))}
                          />
                        ) : (
                          <input
                            className="form-input"
                            type={col.type === 'number' ? 'number' : 'text'}
                            style={{ padding: '4px 8px', fontSize: 12, width: col.type === 'number' ? 80 : 140 }}
                            value={editData[col.key] ?? ''}
                            onChange={e => setEditData(p => ({ ...p, [col.key]: col.type === 'number' ? Number(e.target.value) : e.target.value }))}
                          />
                        )
                      ) : (
                        col.type === 'boolean'
                          ? (row[col.key] ? '✓' : '✗')
                          : (row[col.key] ?? '—')
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveRow(i)}>Sauvegarder</button>
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditRow(null)}>Annuler</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => startEditRow(i)}>
                          <Edit2 size={13} /> Modifier
                        </button>
                        {savedRow === i && <span className="badge badge-green" style={{ fontSize: 11 }}>Enregistré</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamTab() {
  const isAdmin = useIsAdmin()
  const [members, setMembers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('agent')
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState(null) // { type: 'success'|'error', msg }

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getTeam()
      setMembers(data)
    } catch {
      // no-op if not connected to backend
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleInvite = async (e) => {
    e.preventDefault()
    setInviting(true)
    setFeedback(null)
    try {
      await api.inviteMember({ email: inviteEmail, role: inviteRole })
      setFeedback({ type: 'success', msg: `Invitation envoyée à ${inviteEmail}` })
      setInviteEmail('')
      load()
    } catch (err) {
      setFeedback({ type: 'error', msg: err.message })
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (id, role) => {
    try {
      await api.updateMemberRole(id, role)
      setMembers(m => m.map(x => x.id === id ? { ...x, role } : x))
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRemove = async (id, name) => {
    if (!window.confirm(`Retirer ${name} de l'agence ?`)) return
    try {
      await api.removeMember(id)
      setMembers(m => m.filter(x => x.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  const roleBadge = (role) => (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: role === 'admin' ? 'rgba(99,102,241,0.2)' : 'rgba(34,197,94,0.15)',
      color:      role === 'admin' ? '#a5b4fc' : '#86efac',
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>{role}</span>
  )

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Invite form — admin only */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Inviter un membre</h3>
          {feedback && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
              background: feedback.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color:      feedback.type === 'success' ? '#86efac' : '#fca5a5',
              border: `1px solid ${feedback.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>{feedback.msg}</div>
          )}
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email" required placeholder="email@exemple.com"
              value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
              className="form-input" style={{ flex: 1, minWidth: 200 }}
            />
            <select
              value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              className="form-input" style={{ width: 120 }}
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn btn-primary" disabled={inviting}>
              {inviting ? 'Envoi…' : 'Inviter'}
            </button>
          </form>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            L'invité recevra un lien par email pour créer son compte.
          </p>
        </div>
      )}

      {/* Members list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
          Membres ({members.length})
        </div>
        {loading ? (
          <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center' }}>Chargement…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--text3)', textAlign: 'center' }}>Aucun membre trouvé. Configurez votre backend Railway pour afficher l'équipe.</div>
        ) : members.map((m, i) => (
          <div key={m.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
            borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: 'var(--text2)',
            }}>
              {(m.full_name || m.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.full_name || '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>{m.email}</div>
            </div>
            {isAdmin ? (
              <select
                value={m.role || 'agent'}
                onChange={e => handleRoleChange(m.id, e.target.value)}
                className="form-input" style={{ width: 110, fontSize: 12, padding: '4px 8px' }}
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            ) : roleBadge(m.role)}
            {isAdmin && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', flexShrink: 0 }}
                onClick={() => handleRemove(m.id, m.full_name || m.email)}
              >✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// SETTINGS (main export)
// ─────────────────────────────────────────────────────────

export default function Settings() {
  const { t } = useTranslation('settings')
  const [activeTab, setActiveTab] = useState('agence')

  return (
    <div>
      <div className="page-header"><div><h2>{t('title')}</h2><p>{t('subtitle')}</p></div></div>
      <div className="page-body">
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
          {SETTINGS_TABS_KEYS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 20px', fontSize: 14, fontWeight: 600,
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text2)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -2,
                transition: 'color .15s',
              }}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {activeTab === 'agence' && <AgenceTab />}
        {activeTab === 'parc' && <FleetConfigTab />}
        {activeTab === 'general' && <GeneralConfigTab />}
        {activeTab === 'equipe' && <TeamTab />}
      </div>
    </div>
  )
}
