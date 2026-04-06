// ── Formatters ────────────────────────────────────────────
export const fmt = (n) =>
  typeof n === 'number' ? n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

export const fmtDate = (d) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('fr-MA') } catch { return d }
}

// ── Shared styles ─────────────────────────────────────────
export const card = {
  background: 'var(--bg-secondary, #1e2130)',
  border: '1px solid var(--border, #2d3147)',
  borderRadius: 10,
  padding: '20px 24px',
}

export const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

export const th = {
  padding: '10px 12px',
  textAlign: 'left',
  color: 'var(--text3, #8892a4)',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  borderBottom: '1px solid var(--border, #2d3147)',
  background: 'var(--bg-tertiary, #252a3a)',
}

export const td = {
  padding: '10px 12px',
  color: 'var(--text1, #e2e8f0)',
  borderBottom: '1px solid var(--border, #2d3147)',
  verticalAlign: 'middle',
}

export const inputStyle = {
  background: 'var(--bg-tertiary, #252a3a)',
  border: '1px solid var(--border, #2d3147)',
  borderRadius: 6,
  color: 'var(--text1, #e2e8f0)',
  padding: '7px 10px',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
}

export const selectStyle = { ...inputStyle }

export const btnPrimary = {
  background: 'var(--accent, #6366f1)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

export const btnSecondary = {
  background: 'transparent',
  color: 'var(--text2, #a0aec0)',
  border: '1px solid var(--border, #2d3147)',
  borderRadius: 6,
  padding: '7px 14px',
  fontSize: 13,
  cursor: 'pointer',
}

export const badge = (color) => ({
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  ...color,
})

export const DEPOSIT_STATUS_LABELS = {
  held:               'En attente',
  partially_released: 'Libéré partiel',
  released:           'Libéré',
  retained:           'Retenu',
}

export const DEPOSIT_STATUS_COLORS = {
  held:               { background: '#7c3a00', color: '#fbbf24' },
  partially_released: { background: '#1e3a5f', color: '#60a5fa' },
  released:           { background: '#14532d', color: '#4ade80' },
  retained:           { background: '#4a1942', color: '#e879f9' },
}
