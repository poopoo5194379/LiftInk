import { _electron as electron } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

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
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: /输入设备/ }).click()
    await page.getByRole('button', { name: '打开详细输入测试' }).click()
    const canvas = page.locator('.pen-poc-canvas-host canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Canvas not found')
    for (let line = 0; line < 3; line++) {
      await page.mouse.move(box.x + 90, box.y + 100 + line * 55)
      await page.mouse.down()
      for (let point = 1; point <= 18; point++)
        await page.mouse.move(
          box.x + 90 + point * 18,
          box.y + 100 + line * 55 + Math.sin(point * 0.6) * 13
        )
      await page.mouse.up()
    }
    await page.screenshot({
      path: `screenshots/pen-input-poc-${width}x${height}.png`,
      animations: 'disabled',
      scale: 'css',
      clip: { x: 0, y: 0, width, height }
    })
    const diagnostics = await page.evaluate(() => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      coalesced: typeof PointerEvent.prototype.getCoalescedEvents === 'function',
      rawUpdate: 'onpointerrawupdate' in window,
      canvasWidth: document.querySelector('.pen-poc-canvas-host canvas')?.getBoundingClientRect()
        .width
    }))
    console.log(`${width}x${height}`, diagnostics)
  } finally {
    await app.close()
  }
}
