import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'screenshots')
const BASE = 'http://localhost'
const LANG = process.env.SHOT_LANG || 'fr'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
await ctx.addInitScript((lang) => {
  try { localStorage.setItem('lang', lang) } catch {}
}, LANG)
const page = await ctx.newPage()

async function go(path, wait = 1200) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
}
async function full(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
  console.log('shot', name)
}
async function clip(name, selector) {
  const el = page.locator(selector).first()
  try {
    await el.scrollIntoViewIfNeeded()
    await el.screenshot({ path: join(OUT, `${name}.png`) })
    console.log('clip', name)
  } catch (e) { console.log('clip FAILED', name, e.message) }
}

// Full-page captures
await go('/validate'); await full('validate')
await go('/reports/81'); await full('report-recevable')       // finalized, Recevable
await go('/reports/82', 1600); await full('report-nonrecevable') // draft w/ review, Non recevable
await go('/policies/4'); await full('policy')
await go('/library'); await full('library')
// Library reference-lists tab
try {
  await page.getByText(/Listes de référence|Reference lists/i).first().click()
  await page.waitForTimeout(700)
  await full('library-references')
} catch (e) { console.log('lib tab failed', e.message) }
await go('/insights'); await full('insights')
await go('/settings'); await full('settings')
await go('/'); await full('dashboard')

await browser.close()
console.log('DONE')
