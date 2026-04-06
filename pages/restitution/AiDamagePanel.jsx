import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ZONES } from '../../utils/restitutionUtils'
import { updateContract } from '../../lib/db'
import { api } from '../../lib/api'

export default function AiDamagePanel({ contract, vehicle, agency, returnPhotos, beforePhotos, damages, onDamagesChange }) {
  const { t } = useTranslation('restitution')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult]   = useState(null)
  const [aiError, setAiError]     = useState(null)

  const runAiAnalysis = async () => {
    const afterPhotos = Object.values(returnPhotos || {}).filter(Boolean)
    if (afterPhotos.length === 0) { alert('Aucune photo disponible. Prenez des photos à l\'étape précédente.'); return }
    setAiLoading(true)
    setAiError(null)
    setAiResult(null)
    try {
      const result = await api.detectDamage({
        afterPhotos,
        beforePhotos: beforePhotos || [],
        contractNumber: contract.contractNumber,
        vehicleName: contract.vehicleName,
        clientName: contract.clientName,
      })
      setAiResult(result)
      // Persist AI result to contract in localStorage
      try {
        await updateContract({
          ...contract,
          aiAnalysis: result,
          damageFlagged: result.hasDamage,
          aiAnalysedAt: result.analysedAt,
        })
      } catch (e) {
        console.error('[AI] updateContract', e)
      }
      // Auto-populate damage checkboxes from AI findings
      if (result.hasDamage && result.damages?.length > 0) {
        const newDamages = [...damages]
        result.damages.forEach(d => {
          const zone = ZONES.find(z => d.zone?.toLowerCase().includes(z.toLowerCase()))
          if (zone) {
            const existing = newDamages.find(dmg => dmg.zone === zone)
            if (existing) {
              existing.checked = true
              if (!existing.description) existing.description = d.description || ''
            } else {
              newDamages.push({ zone, checked: true, description: d.description || '' })
            }
          }
        })
        onDamagesChange(newDamages)
      }
    } catch (err) {
      console.error('[AI analysis]', err)
      setAiError(err.message || 'Erreur lors de l\'analyse IA')
    } finally {
      setAiLoading(false)
    }
  }

  const downloadAiReport = async () => {
    if (!aiResult) return
    const { generateDamageReport } = await import('../../utils/pdf')
    generateDamageReport({
      agency,
      contract,
      analysis: aiResult,
      beforePhotos: beforePhotos || [],
      afterPhotos: Object.values(returnPhotos || {}).filter(Boolean),
    })
  }

  const downloadDisputePackage = async () => {
    if (!aiResult) return
    const { generateDisputePackage } = await import('../../utils/pdf')
    generateDisputePackage({
      agency,
      contract,
      vehicle,
      beforePhotos: beforePhotos || [],
      afterPhotos: Object.values(returnPhotos || {}).filter(Boolean),
      aiAnalysis: aiResult,
    })
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>
          🤖 Analyse IA des dommages
        </div>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
          onClick={runAiAnalysis}
          disabled={aiLoading}
        >
          {aiLoading ? 'Analyse en cours…' : '✦ Lancer l\'analyse IA'}
        </button>
      </div>

      {aiError && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
          {aiError}
        </div>
      )}

      {aiResult && (
        <div>
          {/* Verdict */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            background: aiResult.hasDamage ? '#fee2e2' : '#dcfce7',
            borderRadius: 6, padding: '8px 12px',
          }}>
            <span style={{ fontSize: 16 }}>{aiResult.hasDamage ? '⚠️' : '✅'}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: aiResult.hasDamage ? '#b91c1c' : '#15803d' }}>
                {aiResult.hasDamage ? 'Dommages détectés' : 'Aucun dommage détecté'}
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8, opacity: 0.7 }}>
                  Confiance: {aiResult.confidence === 'high' ? 'Élevée' : aiResult.confidence === 'medium' ? 'Moyenne' : 'Faible'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{aiResult.summary}</div>
            </div>
          </div>

          {/* Damage list */}
          {aiResult.damages?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {aiResult.damages.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 4, alignItems: 'flex-start' }}>
                  <span style={{
                    background: d.severity === 'major' ? '#fee2e2' : d.severity === 'minor' ? '#fff7ed' : '#f3f4f6',
                    color: d.severity === 'major' ? '#b91c1c' : d.severity === 'minor' ? '#c2410c' : '#374151',
                    borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', marginTop: 1,
                  }}>
                    {d.severity === 'major' ? 'Majeur' : d.severity === 'minor' ? 'Mineur' : 'Cosmétique'}
                  </span>
                  <span style={{ fontWeight: 600 }}>{d.zone}</span>
                  <span style={{ color: 'var(--text3)' }}>{d.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendation */}
          {aiResult.recommendation && (
            <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginBottom: 10 }}>
              💡 {aiResult.recommendation}
            </div>
          )}

          {/* Download report button */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={downloadAiReport}
            >
              📄 Télécharger rapport IA
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 12px', background: '#fff7ed', borderColor: '#fdba74', color: '#c2410c' }}
              onClick={downloadDisputePackage}
            >
              🗂 Dossier de litige
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
