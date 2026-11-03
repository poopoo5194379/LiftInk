import { _electron as electron } from '@playwright/test'

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForSelector('.brand')
await page.evaluate(() => document.fonts.ready)
const cdp = await page.context().newCDPSession(page)
await cdp.send('DOM.enable')
await cdp.send('CSS.enable')
const { root } = await cdp.send('DOM.getDocument')
for (const [name, selector] of [
  ['brand', '.brand'],
  ['navigation', '.nav-item.active'],
  ['calendar', '.calendar-head strong'],
  ['Chinese heading', '.panel-title h2'],
  ['mixed note', '.note-card strong'],
  ['statistics', '.stat-values strong']
]) {
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  const style = await page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const css = getComputedStyle(node)
      return {
        size: css.fontSize,
        weight: css.fontWeight,
        lineHeight: css.lineHeight,
        tracking: css.letterSpacing
      }
    })
  console.log(
    name,
    style,
    fonts.map(({ familyName, glyphCount }) => `${familyName}: ${glyphCount}`).join(', ')
  )
}
console.log(
  'font ready',
  await page.evaluate(() => document.fonts.check('500 14px "LiftInk Han"', '中文'))
)
await app.close()
