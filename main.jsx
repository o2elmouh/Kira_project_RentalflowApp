import './lib/i18n'
import './index.css'
import { createRoot } from 'react-dom/client'
import { Suspense } from 'react'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <Suspense fallback={
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12 }}>
      <div className="auth-logo">RF</div>
      <p style={{ color:'var(--text3)', fontSize:13 }}>Chargement…</p>
    </div>
  }>
    <App />
  </Suspense>
)
