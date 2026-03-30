import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = 'http://localhost:5173?vite_use_auth=false'

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const nav = async (label) => {
  await page.evaluate((l) => {
    for (const b of document.querySelectorAll('.nav-item'))
      if (b.textContent.includes(l)) { b.click(); break }
  }, label)
  await new Promise(r => setTimeout(r, 600))
}

const shot = async (name) => {
  await page.screenshot({ path: join(__dirname, `test-${name}.png`) })
  console.log(`📸 test-${name}.png`)
}

// ── Load app ──────────────────────────────────────────────
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 })
await new Promise(r => setTimeout(r, 2000))

// ── 1. Dashboard (non-regression) ─────────────────────────
await shot('01-dashboard')

// ── 2. Fleet list ─────────────────────────────────────────
await nav('Fleet')
await new Promise(r => setTimeout(r, 500))
await shot('02-fleet-list')

// ── 3. Fleet card clickable → opens detail ────────────────
const cards = await page.$$('.vehicle-card')
if (cards.length > 0) {
  await cards[0].click()
  await new Promise(r => setTimeout(r, 700))
  await shot('03-fleet-detail-opened')
} else {
  console.log('⚠️  No vehicle cards found')
}

// ── 4. Échéances modal ────────────────────────────────────
const modifierBtn = await page.$('.dashboard-tile button')
if (modifierBtn) {
  await modifierBtn.click()
  await new Promise(r => setTimeout(r, 400))
  await shot('04-echeances-modal')
  // Close modal
  await page.keyboard.press('Escape')
  // Click backdrop if needed
  const backdrop = await page.$('div[style*="rgba(0,0,0,0.45)"]')
  if (backdrop) await backdrop.click()
  await new Promise(r => setTimeout(r, 300))
} else {
  console.log('⚠️  No Modifier button found on tiles')
}

// ── 5. Restitution picker ─────────────────────────────────
await nav('Restitution')
await new Promise(r => setTimeout(r, 600))
await shot('05-restitution-picker')

// ── 6. New Rental (non-regression) ────────────────────────
await nav('New Rental')
await new Promise(r => setTimeout(r, 600))
await shot('06-new-rental')

// ── 7. Contracts (non-regression) ─────────────────────────
await nav('Contracts')
await new Promise(r => setTimeout(r, 600))
await shot('07-contracts')

// ── 8. Settings → General → Options de location ───────────
await nav('Settings')
await new Promise(r => setTimeout(r, 600))
// Click General tab if needed
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button'))
    if (b.textContent.includes('Général') || b.textContent.includes('General')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 400))
// Click Options tab
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button'))
    if (b.textContent.includes('Options')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 400))
await shot('08-rental-options-readonly')

// Click Modifier to enter edit mode
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button'))
    if (b.textContent.trim() === 'Modifier') { b.click(); break }
})
await new Promise(r => setTimeout(r, 300))
await shot('09-rental-options-editmode')

await browser.close()
console.log('\n✅ All tests done')
