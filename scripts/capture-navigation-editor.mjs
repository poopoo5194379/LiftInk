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
    if (width === 1440) {
      await page.getByRole('button', { name: '展开 工作项目', exact: true }).click()
      await page.getByRole('button', { name: '展开 工作项目 / LiftInk', exact: true }).click()
      await page.screenshot({
        path: join('screenshots', 'folders-expanded-1440x900.png'),
        animations: 'disabled',
        scale: 'css',
        clip: { x: 0, y: 0, width, height }
      })
      await page.getByRole('button', { name: '收起 工作项目 / LiftInk', exact: true }).click()
      await page.getByRole('button', { name: '收起 工作项目', exact: true }).click()
    }
    await page.getByRole('button', { name: '查看全部', exact: true }).click()
    await page.screenshot({
      path: join('screenshots', `recent-files-${width}x${height}.png`),
      animations: 'disabled',
      scale: 'css',
      clip: { x: 0, y: 0, width, height }
    })
    const recentCount = await page.locator('.recent-file-row').count()
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.screenshot({
      path: join('screenshots', `new-note-${width}x${height}.png`),
      animations: 'disabled',
      scale: 'css',
      clip: { x: 0, y: 0, width, height }
    })
    if (width === 1440) {
      await page.getByRole('button', { name: '展开页面缩略图' }).click()
      await page.screenshot({
        path: join('screenshots', 'new-note-pages-open-1440x900.png'),
        animations: 'disabled',
        scale: 'css',
        clip: { x: 0, y: 0, width, height }
      })
      await page.getByRole('button', { name: '收起页面缩略图' }).click()
    }
    const editor = await page.locator('.editor-view').boundingBox()
    const paper = await page.locator('.editor-paper').boundingBox()
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      pageManagerOpen: !!document.querySelector('.editor-page-manager')
    }))
    console.log(`${width}x${height}`, {
      recentCount,
      editorWidth: Math.round(editor?.width ?? 0),
      paperWidth: Math.round(paper?.width ?? 0),
      ...layout
    })
  } finally {
    await app.close()
  }
}
