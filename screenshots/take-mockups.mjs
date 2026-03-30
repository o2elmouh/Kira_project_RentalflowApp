import puppeteer from 'puppeteer'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(__dirname, '../public/mockups-vehicle-dashboard.html'), 'utf8')

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 1000 })
await page.setContent(html, { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 1200))

// Full overview
await page.screenshot({ path: join(__dirname, 'mockups-overview.png'), fullPage: true })
console.log('✅ mockups-overview.png')

// Individual styles
for (const [cls, name] of [['dashboard-a','A'],['dashboard-b','B'],['dashboard-c','C']]) {
  const el = await page.$(`.${cls}`)
  if (el) {
    await el.screenshot({ path: join(__dirname, `mockup-style-${name}.png`) })
    console.log(`✅ mockup-style-${name}.png`)
  }
}

await browser.close()
console.log('done')
