import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 })
await new Promise(r => setTimeout(r, 2000))

// Go to Fleet
await page.evaluate(() => {
  for (const b of document.querySelectorAll('.nav-item'))
    if (b.textContent.includes('Fleet')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 1000))
await page.screenshot({ path: join(__dirname, 'fleet-list.png') })
console.log('✅ fleet-list.png')

// Click Historique on first card
await page.evaluate(() => {
  const btn = document.querySelector('.vehicle-card button')
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 1000))
await page.screenshot({ path: join(__dirname, 'fleet-dashboard.png') })
console.log('✅ fleet-dashboard.png')

await browser.close()
