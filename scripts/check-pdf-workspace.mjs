import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const parent = await realpath(tmpdir())
const root = await mkdtemp(join(parent, 'liftink-pdf-workspace-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () => electron.launch({ executablePath, args: executablePath ? [] : ['.'],
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
const source = join(root, 'Landscape fixture.pdf')
let app
try {
  app = await launch()
  let page = await app.firstWindow()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const search = () => page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' })
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, source)
  await page.evaluate(async () => {
    await window.liftInk.exportMarkdownPdf('Landscape fixture', `<style>@page{size:160mm 90mm;margin:8mm}</style>
      <h2>数 据 采 集</h2><p>采 集 数据。采 集 分析。采 集 清洗。</p><p><a href="https://example.org/liftink-fixture">外部链接</a></p>`)
  })
  const action = button('新建 Markdown')
  const labelFits = await action.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element.querySelector('b'))
    const text = range.getBoundingClientRect()
    const card = element.getBoundingClientRect()
    return text.left >= card.left && text.right <= card.right && text.bottom <= card.bottom
  })
  assert.equal(labelFits, true)
  await button('导入 PDF/图片').click()
  await page.locator('.import-workspace input[type=file]').setInputFiles(source)
  const canvas = page.getByRole('img', { name: '笔记画布' })
  await expect(canvas).toBeVisible()
  const [, , width, height] = (await canvas.getAttribute('viewBox')).split(' ').map(Number)
  assert(width > height && Math.abs(width / height - 16 / 9) < 0.03)
  await button('选择 PDF 原文').click()
  const originalText = page.getByLabel('可选中的 PDF 原文')
  await expect(originalText).toContainText(/采.*集/)
  const selectedText = await originalText.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    const result = selection.toString()
    selection.removeAllRanges()
    return result
  })
  assert.match(selectedText.replace(/\s+/g, ''), /采集/)
  await button('选择 PDF 原文').click()
  const shapeSvg = await button('形状').locator('svg').innerHTML()
  const brushSvg = await button('笔刷设置').locator('svg').innerHTML()
  assert.notEqual(shapeSvg, brushSvg)
  const bounds = await canvas.boundingBox()
  await page.mouse.move(bounds.x + bounds.width * 0.32, bounds.y + bounds.height * 0.58)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.48, bounds.y + bounds.height * 0.60, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await button('返回上一页').click()

  await search().fill('采集')
  await expect(page.getByRole('option', { name: /Landscape fixture.*PDF 正文/ })).toBeVisible()
  await page.getByRole('option', { name: /Landscape fixture.*PDF 正文/ }).click()
  await expect(page.getByRole('searchbox', { name: '搜索 PDF 原文' })).toHaveValue('采集')
  await page.locator('.editor-pdf-search-results button').first().click()
  const mark = page.locator('.editor-pdf-search-mark').first()
  await expect(mark).toBeVisible()
  const highlightY = Number(await mark.getAttribute('y'))
  assert(highlightY > 0 && highlightY < height / 2)
  const recorded = await page.evaluate(async () => {
    const { value } = await window.liftInk.loadNoteIndex()
    const note = value.find((entry) => entry.title === 'Landscape fixture')
    const { value: doc } = await window.liftInk.loadDocument(note.id)
    return doc.pages[0].elements.find((element) => element.kind === 'ink').points[0]
  })
  assert(Math.abs(recorded.x / width - 0.32) < 0.02 && Math.abs(recorded.y / height - 0.58) < 0.02)
  const printedPath = join(root, 'Landscape export.pdf')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, printedPath)
  await button('导出或备份').click()
  await button('导出 PDF').click()
  await expect(page.getByText(/已导出：.*Landscape export/)).toBeVisible()
  const printed = await PDFDocument.load(await readFile(printedPath))
  const printedSize = printed.getPage(0).getSize()
  assert(Math.abs(printedSize.width / printedSize.height - width / height) < 0.001)
  const outputTask = getDocument({ data: new Uint8Array(await readFile(printedPath)), useSystemFonts: true })
  try {
    const output = await outputTask.promise
    const original = await output.getPage(1)
    const originalWords = (await original.getTextContent()).items.map((item) => item.str ?? '').join('').replace(/\s+/g, '')
    assert.match(originalWords, /采集/)
    assert((await original.getAnnotations()).some((item) => item.url === 'https://example.org/liftink-fixture'))
  } finally {
    await outputTask.destroy()
  }
  await button('返回上一页').click()
  await search().fill('')
  await button('采集').click()
  await expect(page.locator('.keyword-results')).toContainText('Landscape fixture')
  await button('返回词云').click()

  await button('新建思维导图').click()
  const map = page.locator('.mindmap-scroll')
  const mapBounds = await map.boundingBox()
  await page.mouse.move(mapBounds.x + mapBounds.width / 2, mapBounds.y + mapBounds.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -210)
  await page.keyboard.up('Control')
  await expect(button('重置导图视图')).not.toHaveText('100%')
  const rootTopic = map.locator('.mindmap-node.root')
  const before = await rootTopic.boundingBox()
  await page.keyboard.down('Space')
  await expect(map).toHaveClass(/can-pan/)
  await page.mouse.down()
  await expect(map).toHaveClass(/is-panning/)
  await page.mouse.move(mapBounds.x + mapBounds.width / 2 + 94, mapBounds.y + mapBounds.height / 2 + 52, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect.poll(async () => {
    const after = await rootTopic.boundingBox()
    return Math.max(Math.abs(after.x - before.x - 94), Math.abs(after.y - before.y - 52))
  }).toBeLessThan(3)
  await expect(map).not.toHaveClass(/is-panning|can-pan/)
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await search().fill('采集')
  await expect(page.getByRole('option', { name: /Landscape fixture.*PDF 正文/ })).toBeVisible()
  console.log('Landscape import, pen and highlight coordinates, Han-space search, real keywords, map zoom/pan and restart passed.')
} finally {
  if (app) await app.close()
  const path = await realpath(root)
  if (dirname(path) === parent && basename(path).startsWith('liftink-pdf-workspace-')) {
    await rm(path, { recursive: true, force: true })
  }
}
