import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

const setLang = async (lang) => {
  await page.evaluate((l) => localStorage.setItem('rf_language', l), lang)
  await page.reload({ waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 1500))
}

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 15000 })
await new Promise(r => setTimeout(r, 1500))

// French
await setLang('fr')
await page.screenshot({ path: join(__dirname, 'i18n2-fr-dashboard.png') })
console.log('📸 i18n2-fr-dashboard.png')

// Arabic
await setLang('ar')
await page.screenshot({ path: join(__dirname, 'i18n2-ar-dashboard.png') })
console.log('📸 i18n2-ar-dashboard.png')

// English
await setLang('en')
await page.screenshot({ path: join(__dirname, 'i18n2-en-dashboard.png') })
console.log('📸 i18n2-en-dashboard.png')

await browser.close()
console.log('✅ done')
