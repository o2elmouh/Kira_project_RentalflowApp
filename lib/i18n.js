import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'

// Sync <html dir> + <html lang> with the active language.
// Called on init (so reloads with `ar` saved in localStorage render RTL
// from the first paint) and on every language change (so live switches
// flip the layout without a refresh).
const applyDirection = (lng) => {
  if (typeof document === 'undefined') return
  const code = (lng || 'fr').slice(0, 2)
  document.documentElement.dir  = code === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = code
}

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: ['fr', 'ar', 'en'],
    fallbackLng: 'fr',
    defaultNS: 'common',
    ns: ['common'],
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'rf_language',
      caches: ['localStorage'],
    },
    backend: {
      // Cache-bust per build so deploys don't serve a stale JSON to the
      // browser. __APP_BUILD__ is injected by vite.config.js at build time.
      loadPath: `/locales/{{lng}}/{{ns}}.json?v=${typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev'}`,
    },
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
  })
  .then(() => applyDirection(i18n.language))

i18n.on('languageChanged', applyDirection)

export default i18n
