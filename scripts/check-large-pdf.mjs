import { strict as assert } from 'node:assert'
import { mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

import { concatTransformationMatrix, drawObject, PDFDocument, popGraphicsState, pushGraphicsState } from 'pdf-lib'

const external = process.env.LIFTINK_TEST_LARGE_PDF
const synthetic = process.argv.includes('--synthetic')
if (!external && !synthetic) throw new Error('Set LIFTINK_TEST_LARGE_PDF or use --synthetic')
const temp = await realpath(tmpdir())
const root = await mkdtemp(join(temp, 'liftink-large-pdf-'))
const source = external ?? join(root, '204 scanned pages.pdf')
if (synthetic && !external) {
  const pdf = await PDFDocument.create()
  const size = 720
  for (let index = 0; index < 204; index++) {
    const page = pdf.addPage([612, 792])
    const raster = new Uint8Array(size * size).fill(247)
    for (let row = 55; row < size - 55; row += 24) {
      const length = 260 + ((row * 5 + index * 19) % 310)
      for (let line = 0; line < 4; line++) raster.fill(35, (row + line) * size + 60, (row + line) * size + 60 + length)
    }
    const stream = pdf.context.stream(raster, { Type: 'XObject', Subtype: 'Image', Width: size, Height: size, ColorSpace: 'DeviceGray', BitsPerComponent: 8 })
    const name = page.node.newXObject('Scan', pdf.context.register(stream))
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(560, 0, 0, 690, 26, 51), drawObject(name), popGraphicsState())
  }
  await writeFile(source, await pdf.save({ useObjectStreams: false }))
}
const packaged = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () => electron.launch({ executablePath: packaged, args: packaged ? [] : ['.'],
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
let app
try {
  app = await launch()
  let page = await app.firstWindow()
  const started = Date.now()
  await page.getByRole('button', { name: '导入 PDF/图片', exact: true }).click()
  await page.locator('.import-workspace input[type=file]').setInputFiles(source)
  const canvas = page.locator('.editor-live-canvas')
  await expect(canvas.first()).toBeVisible({ timeout: 180_000 })
  const elapsed = Date.now() - started
  const count = await canvas.count()
  assert(count > 30)
  const target = Math.min(count, 80)
  const last = page.locator('.editor-paper').nth(target - 1)
  await last.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const preview = last.locator('canvas.pdf-page-preview')
  await expect.poll(() => preview.evaluate((element) => element.width), { timeout: 30_000 }).toBeGreaterThan(1)
  const dpr = await page.context().newCDPSession(page)
  await dpr.send('Emulation.setDeviceMetricsOverride', { width: 2560, height: 1440, deviceScaleFactor: 1.5, mobile: false })
  await last.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await expect.poll(() => preview.evaluate((element) => element.width), { timeout: 30_000 }).toBeGreaterThan(1)
  const bounds = await last.locator('.editor-live-canvas').boundingBox()
  await page.mouse.move(bounds.x + 100, Math.max(200, bounds.y + 160))
  await page.mouse.down()
  await page.mouse.move(bounds.x + 180, Math.max(210, bounds.y + 180), { steps: 10 })
  await page.mouse.up()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const record = await page.evaluate(async () => {
    const { value } = await window.liftInk.loadNoteIndex()
    return value[0]
  })
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  const document = await page.evaluate(async (id) => (await window.liftInk.loadDocument(id)).value, record.id)
  assert.equal(document.pages.length, count)
  assert(document.pages[target - 1].elements.some((item) => item.kind === 'ink'))
  console.log(JSON.stringify({ bytes: (await stat(source)).size, pages: count, importMs: elapsed, scrolledTo: target, savedAndReopened: true, simulatedDpr: 1.5, emulatedResolution: '3840x2160' }))
} finally {
  await app?.close().catch(() => undefined)
  const target = await realpath(root)
  if (dirname(target) === temp && basename(target).startsWith('liftink-large-pdf-')) {
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
