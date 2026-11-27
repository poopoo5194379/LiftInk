import { _electron as electron } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

await mkdir('screenshots', { recursive: true })
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768]
]) {
  const app = await electron.launch({ args: ['.'] })
  try {
    const page = await app.firstWindow()
    await (
      await app.browserWindow(page)
    ).evaluate((window, size) => window.setContentSize(size[0], size[1]), [width, height])
    await page.waitForSelector('.note-card')
    await page.evaluate(() => document.fonts.ready)
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const capture = async (name) =>
      page.screenshot({
        path: join('screenshots', `${name}-${width}x${height}.png`),
        animations: 'disabled',
        scale: 'css',
        clip: { x: 0, y: 0, width, height }
      })
    await page.getByRole('button', { name: '标签', exact: true }).click()
    await capture('tags')
    await page.getByRole('button', { name: '首页', exact: true }).click()
    await page.getByRole('button', { name: '查看全部日程' }).click()
    await capture('agenda')
    await page.getByRole('button', { name: '首页', exact: true }).click()
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByRole('button', { name: '笔记位置' }).click()
    await capture('folder-picker')
    await page.getByRole('button', { name: '返回上一页' }).click()
    await page.getByRole('button', { name: '新建思维导图' }).click()
    await capture('mindmap')
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.getByRole('button', { name: '导入 PDF/图片' }).click()
    await capture('import')
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }))
    console.log(`${width}x${height}`, layout)
  } finally {
    await app.close()
  }
}
