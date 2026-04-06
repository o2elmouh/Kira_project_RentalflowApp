import { useState, useEffect } from 'react'
import { getAgency, saveAgency } from '../../lib/db'

export default function AgenceTab() {
  const [agency, setAgency] = useState({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

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
    </>
  )
}
