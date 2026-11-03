import { _electron as electron } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const app = await electron.launch({ args: ['.'] })
try {
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('button', { name: '输入测试' }).click()
  const canvas = page.locator('.pen-poc-canvas-host canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')
  const results = []
  for (const renderer of ['segments', 'freehand']) {
    await page.getByRole('combobox', { name: '轮廓方式' }).selectOption(renderer)
    for (const amount of [1000, 5000]) {
      const before = Number((await canvas.getAttribute('data-frame-count')) || 0)
      await page.getByRole('button', { name: `${amount} 条` }).click({ force: true })
      await page.waitForFunction(
        (previous) =>
          Number(document.querySelector('.pen-poc-canvas-host canvas')?.dataset.frameCount || 0) >
          previous,
        before
      )
      const coldMs = Number(await canvas.getAttribute('data-render-ms'))
      const samples = []
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      for (let index = 0; index < 20; index++) {
        const frame = Number((await canvas.getAttribute('data-frame-count')) || 0)
        await page.mouse.wheel(0, index % 2 ? -18 : 18)
        await page.waitForFunction(
          (previous) =>
            Number(document.querySelector('.pen-poc-canvas-host canvas')?.dataset.frameCount || 0) >
            previous,
          frame
        )
        samples.push(Number(await canvas.getAttribute('data-render-ms')))
      }
      const sorted = [...samples].sort((a, b) => a - b)
      results.push({
        renderer,
        strokes: amount,
        points: amount * 20,
        coldMs,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        maxMs: sorted.at(-1)
      })
    }
  }
  const versions = await app.evaluate(() => ({
    electron: process.versions.electron,
    chromium: process.versions.chrome
  }))
  const metadata = await page.evaluate(() => ({
    devicePixelRatio: devicePixelRatio,
    canvasSize: {
      width: document.querySelector('.pen-poc-canvas-host canvas')?.getBoundingClientRect().width,
      height: document.querySelector('.pen-poc-canvas-host canvas')?.getBoundingClientRect().height
    }
  }))
  const report = {
    date: new Date().toISOString(),
    window: '1440x900',
    ...versions,
    ...metadata,
    methodology:
      '20 alternating wheel-pan redraws per case, Canvas 2D JS submission time; synthetic strokes, no physical pen',
    results
  }
  await writeFile('docs/PEN-POC-BENCHMARK.json', JSON.stringify(report, null, 2) + '\n')
  console.log(report)
} finally {
  await app.close()
}
