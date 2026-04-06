import { AR_LETTERS, parsePlate, buildPlate } from './constants'

export default function PlateInput({ value, onChange }) {
  const { serial, letter, region } = parsePlate(value)
  const set = (s, l, r) => onChange(buildPlate(s, l, r))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input className="form-input text-mono" style={{ width: 90, textAlign: 'center', letterSpacing: 2 }}
        placeholder="12345" maxLength={5} value={serial}
        onChange={e => set(e.target.value.replace(/\D/g, ''), letter, region)} />
      <span style={{ color: 'var(--text3)', fontSize: 16, fontWeight: 700 }}>|</span>
      <select className="form-select text-mono" style={{ width: 64, textAlign: 'center', fontSize: 16, direction: 'rtl' }}
        value={letter} onChange={e => set(serial, e.target.value, region)}>
        {AR_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <span style={{ color: 'var(--text3)', fontSize: 16, fontWeight: 700 }}>|</span>
      <input className="form-input text-mono" style={{ width: 60, textAlign: 'center', letterSpacing: 2 }}
        placeholder="01" maxLength={2} value={region}
        onChange={e => set(serial, letter, e.target.value.replace(/\D/g, ''))} />
      {serial && (
        <div style={{ marginLeft: 8, padding: '4px 12px', background: '#1c1a16', color: '#fff', borderRadius: 4, fontFamily: 'DM Mono, monospace', fontSize: 13, letterSpacing: 2, direction: 'rtl' }}>
          {region} {letter} {serial}
        </div>
      )}
    </div>
  )
}
