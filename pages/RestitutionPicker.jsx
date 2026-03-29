import { useState } from 'react'
import { ArrowLeft, Car } from 'lucide-react'
import { getContracts, getFleet } from '../utils/storage'

export default function RestitutionPicker({ onPick, onCancel }) {
  const contracts = getContracts().filter(c => c.status === 'active')
  const fleet = getFleet()

  const getVehicle = (vehicleId) => fleet.find(v => v.id === vehicleId)

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}><ArrowLeft size={14} /></button>
          <div>
            <h2>Restitution</h2>
            <p>Sélectionnez le véhicule à restituer</p>
          </div>
        </div>
      </div>
      <div className="page-body">
        {contracts.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 60, color: 'var(--text3)' }}>
            <Car size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>Aucun véhicule en location actuellement.</p>
          </div>
        )}
        <div className="fleet-grid">
          {contracts.map(c => {
            const v = getVehicle(c.vehicleId)
            return (
              <div
                key={c.id}
                className="vehicle-card"
                style={{ cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                onClick={() => onPick(c)}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = '' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="vehicle-plate" style={{ direction: 'rtl', fontSize: 13, letterSpacing: 2 }}>
                    {v?.plate || c.vehiclePlate || '—'}
                  </div>
                  <span className="badge badge-orange">En location</span>
                </div>
                <div className="vehicle-name">{v ? `${v.make} ${v.model} ${v.year}` : c.vehicleName || '—'}</div>
                <div className="vehicle-meta" style={{ marginBottom: 8 }}>
                  {c.clientName} · {c.startDate} → {c.endDate}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>Contrat {c.contractNumber}</span>
                  <span style={{ fontSize: 12, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: 'var(--accent)' }}>
                    {(c.totalTTC || 0).toLocaleString()} MAD
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
