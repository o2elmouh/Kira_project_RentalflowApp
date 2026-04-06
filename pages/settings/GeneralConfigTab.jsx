import { useState } from 'react'
import RentalOptionsSection from './RentalOptionsSection'
import SignatureSection from './SignatureSection'

export default function GeneralConfigTab() {
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
