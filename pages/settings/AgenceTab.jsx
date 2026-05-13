import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getAgency, saveAgency } from '../../lib/db'
import { supabase } from '../../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function AgenceTab() {
  const { t } = useTranslation('settings')
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
    if (file.type !== 'application/pdf') { setTplError(t('agency.fileTypeError')); return }
    if (file.size > 5 * 1024 * 1024)     { setTplError(t('agency.fileSizeError')); return }
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
    if (!confirm(t('agency.deleteConfirm'))) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/agency/contract-template`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      })
      if (!res.ok) throw new Error(t('agency.deleteError'))
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

  if (loading) return <p style={{ color: 'var(--text3)', fontSize: 13 }}>{t('agency.loading')}</p>

  return (
    <>
      <div className="card" style={{ maxWidth: 680 }}>
        <div className="card-header">
          <h3>{t('agency.generalInfo')}</h3>
          {saved && <span className="badge badge-green">{t('agency.saved')}</span>}
        </div>
        <div className="card-body">
          <div className="form-row cols-2">
            {field(t('agency.name'), 'name', t('agency.namePlaceholder'))}
            {field(t('agency.city'), 'city', t('agency.cityPlaceholder'))}
          </div>
          <div className="form-row cols-2">
            {field(t('agency.address'), 'address', t('agency.addressPlaceholder'))}
            {field(t('agency.phone'), 'phone', t('agency.phonePlaceholder'))}
          </div>
          <div className="form-row cols-1">
            {field(t('agency.email'), 'email', t('agency.emailPlaceholder'))}
          </div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: 16 }}>
        <div className="card-header">
          <h3>{t('agency.legalSection')}</h3>
        </div>
        <div className="card-body">
          <div className="form-row cols-2">
            {field(t('agency.ice'), 'ice', t('agency.icePlaceholder'))}
            {field(t('agency.rc'), 'rc', t('agency.rcPlaceholder'))}
          </div>
          <div className="form-row cols-2">
            {field(t('agency.if'), 'if_number', t('agency.ifPlaceholder'))}
            {field(t('agency.patente'), 'patente', t('agency.patentePlaceholder'))}
          </div>
          <div className="form-row cols-1">
            {field(t('agency.insurance'), 'insurance_policy', t('agency.insurancePlaceholder'))}
          </div>
          <button className="btn btn-primary mt-2" onClick={save}>{t('agency.saveBtn')}</button>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 680, marginTop: 16 }}>
        <div className="card-header">
          <h3>{t('agency.pdfModel')}</h3>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            {t('agency.pdfDesc')}
          </p>

          {agency.contract_template_url ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a className="btn btn-ghost" href={agency.contract_template_url} target="_blank" rel="noopener noreferrer">
                {t('agency.viewModel')}
              </a>
              <button className="btn btn-ghost" style={{ color: '#CF4500' }} onClick={removeTemplate} disabled={tplUploading}>
                {t('agency.delete')}
              </button>
              <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={tplUploading}>
                {t('agency.replace')}
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={tplUploading}>
              {tplUploading ? t('agency.uploading') : t('agency.uploadBtn')}
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
