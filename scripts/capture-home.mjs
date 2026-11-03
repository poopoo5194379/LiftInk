import { _electron as electron } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const app = await electron.launch({ args: ['.'] })
const page = await app.firstWindow()
await page.waitForSelector('.note-card')
await page.evaluate(() => document.fonts.ready)
await mkdir('screenshots', { recursive: true })
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768]
]) {
  await (
    await app.browserWindow(page)
  ).evaluate((window, size) => window.setContentSize(size[0], size[1]), [width, height])
  await page.waitForTimeout(450)
  if (!process.env.SKIP_SCREENSHOTS) {
    await page.screenshot({
      path: join('screenshots', `home-${width}x${height}.png`),
      animations: 'disabled',
      scale: 'css',
      clip: { x: 0, y: 0, width, height }
    })
  }
  const checks = await page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    notes: document.querySelectorAll('.note-card').length,
    title: document.querySelector('.brand')?.textContent,
    mainRight: Math.round(document.querySelector('.workspace')?.getBoundingClientRect().right || 0),
    scheduleLeft: Math.round(
      document.querySelector('.middle-column')?.getBoundingClientRect().left || 0
    ),
    recentBottom: Math.round(
      document.querySelector('.recent')?.getBoundingClientRect().bottom || 0
    ),
    statsTop: Math.round(document.querySelector('.stats')?.getBoundingClientRect().top || 0),
    lastNoteBottom: Math.round(
      document.querySelector('.note-tile:last-child .note-card')?.getBoundingClientRect().bottom ||
        0
    ),
    alignedTops: ['.nav-item.active', '.search-box', '.middle-column'].map((selector) =>
      Math.round(document.querySelector(selector)?.getBoundingClientRect().top || 0)
    ),
    headerRight: Math.round(document.querySelector('.avatar')?.getBoundingClientRect().right || 0),
    wordCount: document.querySelectorAll('.word-cloud .word').length,
    wordOverlaps: (() => {
      const words = [...document.querySelectorAll('.word-cloud .word')]
      return words.flatMap((word, i) =>
        words
          .slice(i + 1)
          .filter((other) => {
            const a = word.getBoundingClientRect(),
              b = other.getBoundingClientRect()
            return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
          })
          .map((other) => `${word.textContent}/${other.textContent}`)
      )
    })()
  }))
  console.log(`${width}x${height}`, checks)
}
const scheduleBefore = await page.locator('.middle-column').boundingBox()
const handle = await page.locator('.resize-handle').boundingBox()
if (scheduleBefore && handle) {
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 40, y)
  await page.mouse.up()
  const scheduleAfter = await page.locator('.middle-column').boundingBox()
  console.log('right panel resize', Math.round((scheduleAfter?.width || 0) - scheduleBefore.width))
}
await page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' }).fill('云南')
console.log('search result', await page.locator('.note-card').count())
await page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' }).fill('')
await page.getByRole('button', { name: '新建笔记' }).click()
console.log('new note page', await page.getByRole('region', { name: '笔记页面' }).isVisible())
await page.getByRole('button', { name: '返回上一页' }).click()
await page.getByRole('button', { name: '下一月' }).click()
console.log('calendar', await page.locator('.calendar-head strong').textContent())
await page.getByRole('button', { name: '工作项目', exact: true }).click()
console.log('folder filter', await page.locator('.note-card').count())
await page.getByRole('button', { name: '产品', exact: true }).click()
console.log('keyword results', await page.locator('.keyword-results > div button').count())
await page.getByRole('button', { name: '返回词云' }).click()
await page.locator('.keyword-periods').getByRole('button', { name: '7 天' }).click()
console.log('7-day word count', await page.locator('.word-cloud .word').count())
await page.locator('.keyword-periods').getByRole('button', { name: '90 天' }).click()
console.log('90-day word count', await page.locator('.word-cloud .word').count())
console.log(
  '90-day overlaps',
  await page.evaluate(() => {
    const words = [...document.querySelectorAll('.word-cloud .word')]
    return words.flatMap((word, i) =>
      words
        .slice(i + 1)
        .filter((other) => {
          const a = word.getBoundingClientRect(),
            b = other.getBoundingClientRect()
          return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
        })
        .map((other) => `${word.textContent}/${other.textContent}`)
    )
  })
)
await page.getByRole('button', { name: '更多操作', exact: true }).click()
await page.getByRole('button', { name: '新建思维导图' }).click()
console.log(
  'collapsed action workspace',
  await page.getByRole('region', { name: '思维导图页面' }).isVisible()
)
await app.close()
