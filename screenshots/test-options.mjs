import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 })
await new Promise(r => setTimeout(r, 2000))

// Go to Settings
await page.evaluate(() => {
  for (const b of document.querySelectorAll('.nav-item'))
    if (b.textContent.includes('Settings')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 600))

// Click "Configuration générale" tab
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button, [role=tab]'))
    if (b.textContent.includes('Configuration générale') || b.textContent.includes('Configuration generale')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 500))

// Click Options section
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button'))
    if (b.textContent.trim().startsWith('Options')) { b.click(); break }
})
await new Promise(r => setTimeout(r, 400))
await page.screenshot({ path: join(__dirname, 'test-10-options-readonly.png') })
console.log('📸 test-10-options-readonly.png')

// Click Modifier
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button'))
    if (b.textContent.trim() === 'Modifier') { b.click(); break }
})
await new Promise(r => setTimeout(r, 300))
await page.screenshot({ path: join(__dirname, 'test-11-options-editmode.png') })
console.log('📸 test-11-options-editmode.png')

await browser.close()
