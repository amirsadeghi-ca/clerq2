import { chromium } from 'playwright'

const browser = await chromium.launch()
const page = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage()
await page.goto('file:///Users/amirsadeghi/clerq2/report/index.html', { waitUntil: 'networkidle' })
// Wait for all screenshots to finish decoding so none render blank in the PDF.
await page.evaluate(async () => {
  await Promise.all(Array.from(document.images).map(img =>
    img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r })))
})
await page.waitForTimeout(500)
// Emulate screen so the dark-theme CSS colors are preserved.
await page.emulateMedia({ media: 'screen' })
// Single continuous page sized to the full document, so no card/screenshot
// is ever sliced across a page break.
const { w, h } = await page.evaluate(() => ({
  w: document.documentElement.scrollWidth,
  h: document.documentElement.scrollHeight,
}))
await page.pdf({
  path: '/Users/amirsadeghi/clerq2/report/Clerq2-Rapport-conformite-25320-S.pdf',
  printBackground: true,
  width: `${w}px`,
  height: `${h + 4}px`,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
  scale: 1,
})
console.log('PDF written')
await browser.close()
