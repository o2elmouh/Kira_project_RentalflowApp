import { X } from 'lucide-react'

export default function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-secondary, #1e2130)',
        border: '1px solid var(--border, #2d3147)',
        borderRadius: 12,
        width: '100%',
        maxWidth: 520,
        maxHeight: '90vh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border, #2d3147)' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text1, #e2e8f0)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}
