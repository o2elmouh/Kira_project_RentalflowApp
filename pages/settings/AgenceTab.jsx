import { useState, useEffect, useRef } from 'react'
import { getAgency, saveAgency } from '../../lib/db'
import { supabase } from '../../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function AgenceTab() {
  const [agency, setAgency] = useState({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [tplUploading, setTplUploading] = useState(false)
  const [tplError, setTplError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    getAgency()
      .then(ag => {
        if (cancelled) return
        setAgency(ag)
        setLoading(false)
      })
      .catch(err => {
        console.error('[Settings] getAgency', err)
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const uploadTemplate = async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf') { setTplError('Le fichier doit être un PDF.'); return }
    if (file.size > 5 * 1024 * 1024)     { setTplError('5 MB maximum.'); return }
    setTplUploading(true); setTplError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const fd = new FormData()
      fd.append('template', file)
      const res = await fetch(`${API_URL}/agency/contract-template`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Upload failed (${res.status})`)
      }
      const { contract_template_url } = await res.json()
      setAgency(p => ({ ...p, contract_template_url }))
    } catch (err) {
      setTplError(err.message)
    } finally {
      setTplUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeTemplate = async () => {
    if (!confirm('Supprimer le modèle PDF ?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/agency/contract-template`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      })
      if (!res.ok) throw new Error('Échec de la suppression')
      setAgency(p => ({ ...p, contract_template_url: null }))
    } catch (err) {
      setTplError(err.message)
    }
  }

  const save = async () => {
    try {
      await saveAgency(agency)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[Settings] saveAgency', err)
    }
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

      <div className="card" style={{ maxWidth: 680, marginTop: 16 }}>
        <div className="card-header">
          <h3>Modèle de contrat PDF</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            Téléversez votre propre modèle de contrat PDF. Si renseigné, ce
            modèle sera utilisé comme base pour la signature électronique
            (annexé au contrat généré). 5 MB max — format PDF uniquement.
          </p>

          {agency.contract_template_url ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a className="btn btn-ghost" href={agency.contract_template_url} target="_blank" rel="noopener noreferrer">
                Voir le modèle actuel
              </a>
              <button className="btn btn-ghost" style={{ color: '#CF4500' }} onClick={removeTemplate} disabled={tplUploading}>
                Supprimer
              </button>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={tplUploading}>
                Remplacer
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={tplUploading}>
              {tplUploading ? 'Téléversement…' : 'Téléverser un modèle'}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={e => uploadTemplate(e.target.files?.[0])}
          />

          {tplError && (
            <div className="alert alert-danger mt-2" style={{ fontSize: 13 }}>{tplError}</div>
          )}
        </div>
      </div>
    </>
  )
}
