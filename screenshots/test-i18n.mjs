import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

// ── French (default) ──────────────────────────────────────
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 2000))
await page.screenshot({ path: join(__dirname, 'i18n-fr-login.png') })
console.log('📸 i18n-fr-login.png')

// ── Switch to Arabic ──────────────────────────────────────
await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label]')
  if (sel) {
    sel.value = 'ar'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await new Promise(r => setTimeout(r, 1000))
await page.screenshot({ path: join(__dirname, 'i18n-ar-login.png') })
console.log('📸 i18n-ar-login.png')

// ── Switch to English ─────────────────────────────────────
await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label]')
  if (sel) {
    sel.value = 'en'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }
})
await new Promise(r => setTimeout(r, 800))
await page.screenshot({ path: join(__dirname, 'i18n-en-login.png') })
console.log('📸 i18n-en-login.png')

// ── Dashboard in French ───────────────────────────────────
await page.evaluate(() => {
  const sel = document.querySelector('select[aria-label]')
  if (sel) { sel.value = 'fr'; sel.dispatchEvent(new Event('change', { bubbles: true })) }
})
await new Promise(r => setTimeout(r, 600))
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 2000))
// Navigate to dashboard (no auth)
await page.evaluate(() => {
  for (const b of document.querySelectorAll('.nav-item'))
    if (b.textContent.includes('Dashboard') || b.textContent.includes('لوحة')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 600))
await page.screenshot({ path: join(__dirname, 'i18n-fr-dashboard.png') })
console.log('📸 i18n-fr-dashboard.png')

await browser.close()
console.log('\n✅ i18n visual tests done')
