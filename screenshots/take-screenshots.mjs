import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })

// ── Login ────────────────────────────────────────────────────
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 1500))
await page.screenshot({ path: join(OUT, 'auth-login.png') })
console.log('✅ auth-login.png')

// ── Signup ───────────────────────────────────────────────────
const links = await page.$$('button.btn-ghost')
if (links.length > 0) {
  await links[links.length - 1].click()
  await new Promise(r => setTimeout(r, 600))
}
await page.screenshot({ path: join(OUT, 'auth-signup.png') })
console.log('✅ auth-signup.png')

// ── Onboarding step 1 ────────────────────────────────────────
await page.goto('http://localhost:5173?preview=onboarding', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 1500))
await page.screenshot({ path: join(OUT, 'onboarding-step1.png') })
console.log('✅ onboarding-step1.png')

// ── Onboarding step 2 ────────────────────────────────────────
await page.goto('http://localhost:5173?preview=onboarding', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 1000))
// Use React's nativeInputValueSetter to properly trigger onChange
await page.evaluate(() => {
  const input = document.querySelectorAll('input')[0]
  if (!input) return
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  nativeInputValueSetter.call(input, 'Otman El Mouhib')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
})
await new Promise(r => setTimeout(r, 300))
// Click Suivant
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (b.textContent.trim().startsWith('Suivant')) { b.click(); break }
  }
})
await new Promise(r => setTimeout(r, 700))
await page.screenshot({ path: join(OUT, 'onboarding-step2.png') })
console.log('✅ onboarding-step2.png')

await browser.close()
console.log('all done')
