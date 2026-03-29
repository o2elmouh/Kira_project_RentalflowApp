import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ar', label: 'العربية', flag: '🇲🇦' },
  { code: 'en', label: 'English',  flag: '🇬🇧' },
]

export default function LanguageSelector() {
  const { i18n } = useTranslation()

  const switchLang = (code) => {
    i18n.changeLanguage(code)
    document.documentElement.dir  = code === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = code
  }

  return (
    <select
      value={i18n.language?.slice(0, 2) || 'fr'}
      onChange={e => switchLang(e.target.value)}
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        padding: '5px 8px',
        cursor: 'pointer',
        width: '100%',
        fontFamily: 'inherit',
      }}
      aria-label="Langue / Language"
    >
      {LANGUAGES.map(({ code, label, flag }) => (
        <option key={code} value={code} style={{ background: '#1c1a16', color: '#fff' }}>
          {flag} {label}
        </option>
      ))}
    </select>
  )
}
