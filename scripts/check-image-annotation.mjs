import assert from 'node:assert/strict'
import { mkdtemp, realpath, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(await realpath(tmpdir()), 'liftink-image-ink-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
let app, page
const button = (name) => page.getByRole('button', { name, exact: true })
const canvas = () => page.getByLabel('笔记画布')
const picture = () => canvas().locator('image')
const launch = async () => {
  app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
  page = await app.firstWindow()
  page.setDefaultTimeout(5000)
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
}
const stroke = async (from, to) => {
  await page.mouse.move(...from)
  await page.mouse.down()
  await page.mouse.move(...to, { steps: 10 })
  await page.mouse.up()
}

try {
  await launch()
  await page.locator('.new-note').click()
  await page.getByLabel('笔记标题').fill('图片批注回归')
  const png = await page.evaluate(() => {
    const image = document.createElement('canvas')
    image.width = 220; image.height = 140
    image.getContext('2d').fillRect(0, 0, image.width, image.height)
    return image.toDataURL().split(',')[1]
  })
  await page.locator('.editor-file-input').first().setInputFiles({ name: 'dark.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(picture()).toHaveAttribute('href', /^data:image\/png/)
  await picture().scrollIntoViewIfNeeded()
  await canvas().evaluate((element) => Promise.all(element.closest('main').getAnimations().map((animation) => animation.finished)))
  const box = await picture().boundingBox()
  assert(box)
  const point = (x, y) => [box.x + box.width * x, box.y + box.height * y]
  const originalX = await picture().getAttribute('x')
  const ink = canvas().locator('path[opacity]')
  await button('钢笔').click()
  await stroke(point(0.2, 0.3), point(0.75, 0.3))
  await expect(button('钢笔')).toHaveAttribute('aria-pressed', 'true')
  await expect(ink).toHaveCount(1)
  await expect(picture()).toHaveAttribute('x', originalX)
  await button('荧光笔').click()
  await stroke(point(0.2, 0.65), point(0.75, 0.65))
  await expect(ink).toHaveCount(2)
  const highlight = canvas().locator('path[opacity="0.52"]')
  await expect(highlight).toHaveCSS('mix-blend-mode', 'normal')
  assert(await canvas().evaluate((svg) => {
    const image = svg.querySelector('image')
    const highlight = svg.querySelector('path[opacity="0.52"]')
    const pen = svg.querySelector('path[opacity="1"]')
    return !!(image.compareDocumentPosition(highlight) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      !!(highlight.compareDocumentPosition(pen) & Node.DOCUMENT_POSITION_FOLLOWING)
  }))
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await app.close()
  await launch()
  await page.getByText('图片批注回归', { exact: true }).first().click()
  await expect(canvas().locator('path[opacity]')).toHaveCount(2)
  await expect(picture()).toHaveAttribute('href', /^data:image\/png/)
  const originalImage = await picture().getAttribute('href')

  const exportPath = join(root, 'annotated.png')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, exportPath)
  await button('导出或备份').click()
  await button('导出 PNG').click()
  await expect(page.getByText(/已导出：/)).toBeVisible()
  const bytes = await readFile(exportPath)
  const highlightedPixel = await picture().evaluate(async (image, png) => {
    const decoded = new Image()
    decoded.src = `data:image/png;base64,${png}`
    await decoded.decode()
    const view = image.ownerSVGElement.viewBox.baseVal
    const canvas = document.createElement('canvas')
    canvas.width = decoded.width; canvas.height = decoded.height
    const context = canvas.getContext('2d')
    context.drawImage(decoded, 0, 0)
    return [...context.getImageData((image.x.baseVal.value + image.width.baseVal.value * 0.45) * canvas.width / view.width,
      (image.y.baseVal.value + image.height.baseVal.value * 0.65) * canvas.height / view.height, 1, 1).data]
  }, bytes.toString('base64'))
  assert(highlightedPixel.slice(0, 3).some((channel) => channel > 40), 'Exported highlight must be visible on black')

  await button('橡皮擦').click()
  const nextBox = await picture().boundingBox()
  assert(nextBox)
  const inside = (x, y) => [nextBox.x + nextBox.width * x, nextBox.y + nextBox.height * y]
  await stroke(inside(0.18, 0.3), inside(0.77, 0.3))
  await stroke(inside(0.18, 0.65), inside(0.77, 0.65))
  await expect(canvas().locator('path[opacity]')).toHaveCount(0)
  await expect(picture()).toHaveAttribute('x', originalX)
  await expect(picture()).toHaveAttribute('href', originalImage)
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const savedKinds = await page.evaluate(async () => {
    const { value: index } = await window.liftInk.loadNoteIndex()
    const note = index.find((item) => item.title === '图片批注回归')
    const { value } = await window.liftInk.loadDocument(note.id)
    return value.pages[0].elements.map((element) => element.kind)
  })
  assert.deepEqual(savedKinds, ['image'])
  console.log('PASS: draw, highlight, export, reopen and erase ink over an inserted image')
} finally {
  await app?.close().catch(() => undefined)
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
