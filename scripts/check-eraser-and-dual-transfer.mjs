/* eslint @typescript-eslint/explicit-function-return-type: off -- Playwright fixtures use JavaScript callbacks. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const root = await mkdtemp(join(tmpdir(), 'liftink-eraser-and-dual-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () =>
  electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
  })
let app

try {
  app = await launch()
  let page = await app.firstWindow()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const load = (id) =>
    page.evaluate(async (noteId) => (await window.liftInk.loadDocument(noteId)).value, id)
  const point = (surface, x, y) =>
    surface.evaluate(
      (element, axes) => {
        const p = new DOMPoint(...axes).matrixTransform(element.getScreenCTM())
        return { x: p.x, y: p.y }
      },
      [x, y]
    )
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await expect(page.getByRole('heading', { name: '开始使用 LiftInk' })).toBeVisible()
  const pdf = await PDFDocument.create()
  pdf.addPage([620, 460]).drawText('Project reading notes', { x: 72, y: 368, size: 22 })
  const fixture = await page.evaluate(
    async (pdfBytes) => {
      const layers = [
        { id: 'base', name: '手写', visible: true, locked: false },
        { id: 'locked', name: '锁定图层', visible: true, locked: true }
      ]
      const ink = (id, x, y, layerId = 'base') => ({
        id,
        kind: 'ink',
        brush: 'pen',
        color: '#3e346b',
        width: 4,
        layerId,
        points: [
          { x, y, pressure: 0.5 },
          { x: x + 35, y: y + 12, pressure: 0.5 }
        ]
      })
      const left = {
        id: 'left',
        title: '阅读与批注',
        originalTitle: '阅读与批注',
        date: '',
        kind: 'blank',
        tags: [],
        folder: '未分类',
        summary: '',
        favorite: false,
        documentExpected: true
      }
      const sourcePdfId = await window.liftInk.storePdfSource(new Uint8Array(pdfBytes))
      const right = {
        ...left,
        id: 'right',
        title: '摘录与整理',
        originalTitle: '摘录与整理',
        kind: 'pdf'
      }
      await window.liftInk.initializeNote(left, {
        version: 1,
        noteId: left.id,
        pages: [
          {
            id: 'left-first',
            paper: 'grid',
            size: { width: 640, height: 480 },
            layers,
            elements: [ink('near', 295, 235), ink('far', 565, 390), ink('keep', 85, 120, 'locked')]
          },
          {
            id: 'left-second',
            paper: 'lines',
            size: { width: 420, height: 320 },
            elements: [ink('second-ink', 35, 45)]
          }
        ]
      })
      await window.liftInk.initializeNote(right, {
        version: 1,
        noteId: right.id,
        sourcePdfId,
        pages: [
          {
            id: 'right-first',
            paper: 'blank',
            size: { width: 620, height: 460 },
            sourcePdfId,
            sourcePageNumber: 1,
            elements: [ink('right-ink', 70, 114)]
          }
        ]
      })
      await window.liftInk.saveNoteIndex([left, right])
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 400
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#f1f0fa'
      ctx.fillRect(0, 0, 640, 400)
      ctx.fillStyle = '#372d52'
      ctx.font = 'bold 26px sans-serif'
      ctx.fillText('季度阅读计划', 120, 120)
      for (const [i, height] of [60, 90, 132, 100].entries()) {
        ctx.fillStyle = ['#9182c9', '#5965a8', '#729486', '#bd8d96'][i]
        ctx.fillRect(138 + i * 66, 286 - height, 45, height)
      }
      return {
        dataUrl: canvas.toDataURL(),
        width: canvas.width,
        height: canvas.height,
        label: '测试屏幕'
      }
    },
    Array.from(await pdf.save())
  )
  await app.evaluate(({ ipcMain }, capture) => {
    ipcMain.removeHandler('liftink:capture-screen')
    ipcMain.handle('liftink:capture-screen', () => capture)
  }, fixture)
  await page.reload()
  await page.locator('.note-card').filter({ hasText: '阅读与批注' }).click()
  const leftCanvas = page.locator('svg[data-page-id="left-first"]')
  const secondCanvas = page.locator('svg[data-page-id="left-second"]')
  const paper = () => page.getByRole('dialog', { name: '选择橡皮大小' })
  await button('橡皮擦').click()
  await button('橡皮大小 24 像素').click()
  await paper().getByLabel('精确直径').fill('250')
  await paper().getByLabel('精确直径').press('Enter')
  await paper().getByLabel('直径滑块').press('End')
  await expect(paper().getByLabel('精确直径')).toHaveValue('800')
  await paper().getByLabel('直径滑块').press('Home')
  await expect(paper().getByLabel('精确直径')).toHaveValue('4')
  await paper().getByLabel('精确直径').fill('250')
  await page.keyboard.press('Escape')
  await leftCanvas.scrollIntoViewIfNeeded()
  let center = await point(leftCanvas, 320, 240)
  await page.mouse.move(center.x, center.y)
  await expect(leftCanvas.locator('.editor-eraser-outline')).toHaveAttribute('r', '125')
  await page.mouse.click(center.x, center.y)
  await page.keyboard.press('Control+s')
  await expect
    .poll(async () => (await load('left')).pages[0].elements.map(({ id }) => id))
    .toEqual(['far', 'keep'])
  await button('撤销').click()
  await expect.poll(async () => (await load('left')).pages[0].elements.length).toBe(3)
  await button('橡皮大小 250 像素').click()
  await paper().getByRole('button', { name: '页面大小' }).click()
  await secondCanvas.hover()
  await expect(secondCanvas.locator('.editor-eraser-outline')).toHaveAttribute('r', '264.5')
  await button('缩小画布').click()
  await button('缩小画布').click()
  await leftCanvas.scrollIntoViewIfNeeded()
  center = await point(leftCanvas, 320, 240)
  await page.mouse.move(center.x, center.y)
  await expect(leftCanvas.locator('.editor-eraser-outline')).toHaveAttribute('r', '400')
  await page.mouse.click(center.x, center.y)
  await page.keyboard.press('Control+s')
  await expect
    .poll(async () => (await load('left')).pages[0].elements.map(({ id }) => id))
    .toEqual(['keep'])
  assert.equal((await load('left')).pages[1].elements[0].id, 'second-ink')
  await button('撤销').click()
  await expect.poll(async () => (await load('left')).pages[0].elements.length).toBe(3)

  await button('区域截图').click()
  const capture = page.getByAltText('当前屏幕截图')
  await expect(capture).toBeVisible()
  await capture.evaluate((image) => image.decode())
  const box = await capture.boundingBox()
  await page.mouse.move(box.x + box.width * 0.14, box.y + box.height * 0.22)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.78, { steps: 8 })
  await page.mouse.up()
  await button('贴入笔记').click()
  await expect(leftCanvas.locator('image')).toBeVisible()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const picture = (await load('left')).pages[0].elements.find((element) => element.kind === 'image')
  assert(picture)
  const drag = async (surface, x, y) => {
    const from = await point(
      leftCanvas,
      picture.x + picture.width / 2,
      picture.y + picture.height / 2
    )
    const to = await point(surface, x, y)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await expect(page.locator('[data-image-drop="true"]')).toBeVisible()
    await page.mouse.up()
  }
  await button('双开页面').click()
  await page.getByLabel('选择参照页面').selectOption('left-second')
  const reference = page.getByRole('img', { name: '参照页面' })
  await drag(reference, 210, 160)
  await expect
    .poll(
      async () =>
        (await load('left')).pages[1].elements.find((element) => element.id === picture.id)?.assetId
    )
    .toBe(picture.assetId)
  await expect(leftCanvas.locator('image')).toHaveCount(0)
  await button('撤销').click()
  await expect(leftCanvas.locator('image')).toBeVisible()
  await page.getByLabel('选择参照笔记').selectOption('right')
  const rightCanvas = page.locator('svg[data-page-id="right-first"]')
  await expect(rightCanvas).toBeVisible()
  await drag(rightCanvas, 300, 220)
  await expect
    .poll(
      async () =>
        (await load('right')).pages[0].elements.find((element) => element.kind === 'image')?.assetId
    )
    .toBe(picture.assetId)
  await expect
    .poll(async () =>
      (await load('left')).pages[0].elements.some((element) => element.id === picture.id)
    )
    .toBe(false)
  const previewPath = process.env.LIFTINK_TEST_WORKSPACE_SCREENSHOT
  if (previewPath)
    await page.screenshot({ path: previewPath, scale: 'css', animations: 'disabled' })

  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await page.locator('.note-card').filter({ hasText: '摘录与整理' }).click()
  await expect(page.locator('svg[data-page-id="right-first"] image')).toBeVisible()
  assert.equal(
    (await load('left')).pages[0].elements.some((element) => element.id === picture.id),
    false
  )
  console.log(
    'Precise and page-size erasing, both page sizes, zoom, locked layers, undo, screenshot drops and restart passed.'
  )
} finally {
  await app?.close()
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
