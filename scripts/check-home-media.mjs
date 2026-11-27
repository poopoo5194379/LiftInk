import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const parent = await realpath(tmpdir())
const root = await mkdtemp(join(parent, 'liftink-home-media-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () => electron.launch({ executablePath, args: executablePath ? [] : ['.'],
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
let app
try {
  app = await launch()
  let page = await app.firstWindow()
  const browserWindow = await app.browserWindow(page)
  const resize = (width, height) => browserWindow.evaluate((window, size) => window.setContentSize(...size), [width, height])
  await resize(1366, 768)
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 96
    const context = canvas.getContext('2d')
    context.fillStyle = '#9460cb'
    context.fillRect(0, 0, 128, 96)
    return canvas.toDataURL().split(',')[1]
  }), 'base64')
  const pdf = await PDFDocument.create()
  pdf.addPage([500, 600]).drawText('Real import fixture', { x: 35, y: 450 })
  const pdfPath = join(root, 'Real PDF.pdf')
  const pngPath = join(root, 'Real image.png')
  await writeFile(pdfPath, await pdf.save())
  await writeFile(pngPath, png)
  await page.getByRole('button', { name: '导入 PDF/图片' }).click()
  await page.locator('.import-workspace input[type=file]').setInputFiles([pdfPath, pngPath], { timeout: 4000 })
  await expect(page.getByRole('region', { name: '最近文件列表' })).toBeVisible()
  const openRow = (name) => page.getByRole('button', { name: new RegExp(name) }).first().click()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const home = () => button('首页').click()
  const drawBox = async (locator, start = 0.15, end = 0.68) => {
    await expect(locator).toBeVisible()
    const { x, y, width, height } = await locator.boundingBox()
    await page.mouse.move(x + width * start, y + height * start)
    await page.mouse.down()
    await page.mouse.move(x + width * end, y + height * end, { steps: 8 })
    await page.mouse.up()
  }
  await openRow('Real PDF')
  await expect(page.getByRole('img', { name: 'PDF 原页' }).first()).toBeVisible()
  await button('自定义钢笔笔宽').click()
  await page.getByLabel('精确笔宽').fill('5.7')
  await page.getByLabel('精确笔宽').press('Enter')
  await expect(button('自定义钢笔笔宽')).toHaveText('5.7 px')
  await page.keyboard.press('Escape')
  const canvas = page.getByRole('img', { name: '笔记画布' }).first()
  await drawBox(canvas, 0.16, 0.27)
  await button('文本').click()
  const canvasBounds = await canvas.boundingBox()
  await page.mouse.click(canvasBounds.x + 135, canvasBounds.y + 140)
  await page.getByLabel('文本内容').fill('自定义字号')
  await page.getByLabel('文本字号').fill('32.5')
  await button('确定').click()
  await expect(canvas.locator('text').filter({ hasText: '自定义字号' })).toHaveAttribute('font-size', '32.5')
  await page.keyboard.press('Control+s')
  await button('返回上一页').click()
  await openRow('Real image')
  await expect(page.locator('.editor-live-canvas image')).toBeVisible()
  await home()
  const previews = page.locator('.note-card img[alt="第一页缩略图"]')
  await expect(previews).toHaveCount(2)
  await expect.poll(() => previews.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true)
  const pagePixels = await previews.evaluateAll((images) => images.map((image) => {
    const canvas = document.createElement('canvas')
    canvas.width = 75
    canvas.height = 98
    canvas.getContext('2d').drawImage(image, 0, 0, 75, 98)
    return canvas.toDataURL()
  }))
  assert.notEqual(...pagePixels)
  console.log('Homepage file picker stored real PDF and image notes with different first-page thumbnails.')

  for (const title of ['第一项目标', '第二项目标', '第三项目标', '第四项目标']) {
    await button('新增目标').click()
    await page.getByLabel('目标名称').fill(title)
    await button('保存目标').click()
  }
  await expect(page.locator('.goals .goal:visible')).toHaveCount(3)
  await page.locator('.home-goals-more summary').click()
  await expect(button('第四项目标')).toBeVisible()
  await page.locator('.home-goals-more summary').click()
  const screenshotDirectory = process.env.LIFTINK_TEST_SCREENSHOTS
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768]]) {
    await resize(width, height)
    await expect.poll(() => page.evaluate(([w, h]) => Math.max(
      Math.abs(window.innerWidth - w), Math.abs(window.innerHeight - h)
    ), [width, height])).toBeLessThanOrEqual(1)
    await expect(button('新建 Markdown')).toBeVisible()
    const layout = await page.evaluate(() => {
      const recent = document.querySelector('.recent').getBoundingClientRect()
      const sidebar = document.querySelector('.middle-column').getBoundingClientRect()
      return {
        titlesFit: [...document.querySelectorAll('.note-card > strong')].every((title) => title.getBoundingClientRect().bottom < recent.bottom),
        goalsFit: document.querySelector('.home-goals-more').getBoundingClientRect().bottom < sidebar.bottom
      }
    })
    assert.deepEqual(layout, { titlesFit: true, goalsFit: true }, `Clipped homepage content at ${width}×${height}`)
    if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, `home-media-${width}x${height}.png`) })
  }

  await button('新建思维导图').click()
  await page.getByLabel('内容标题').fill('Mind map fixture')
  await button('中心主题').press('Tab')
  await page.getByLabel('主题文字').fill('左侧方案')
  await page.getByLabel('主题文字').press('Enter')
  await button('左侧方案').press('Tab')
  await page.getByLabel('主题文字').fill('分支子主题')
  await page.getByLabel('主题文字').press('Enter')
  await button('左侧方案').press('Enter')
  await page.getByLabel('主题文字').fill('右侧方案')
  await page.getByLabel('主题文字').press('Enter')
  await expect(page.locator('.mindmap-stage > svg path')).toHaveCount(3)
  const rootX = (await button('中心主题').boundingBox()).x
  assert((await button('左侧方案').boundingBox()).x > rootX)
  assert((await button('右侧方案').boundingBox()).x < rootX)
  await page.locator('.mindmap-node').filter({ has: button('左侧方案') }).getByLabel('收起分支').click()
  await expect(button('分支子主题')).toHaveCount(0)
  await page.locator('.mindmap-node').filter({ has: button('左侧方案') }).getByLabel('展开分支').click()
  await expect(button('分支子主题')).toBeVisible()
  if (screenshotDirectory) await page.screenshot({ path: join(screenshotDirectory, 'mind-map-1366x768.png') })
  await button('保存到未分类').click()
  await home()
  console.log('Custom ink width, text size, folded homepage goals and keyboard mind-map hierarchy passed.')

  await button('新建 Markdown').click()
  await page.getByLabel('笔记标题').fill('Markdown media fixture')
  let body = page.getByRole('textbox', { name: 'Markdown 正文' })
  await expect(body).toHaveAttribute('contenteditable', 'true')
  await body.pressSequentially('Semantic section')
  await button('标题样式').click()
  await button('H2').click()
  await expect(body.locator('h2')).toHaveText('Semantic section')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Export test body')
  await page.locator('.markdown-toolbar input[type=file]').setInputFiles(pngPath)
  const image = body.getByRole('img', { name: 'Real image.png' })
  await expect(image).toBeVisible()
  await button('选择图片 Real image.png').click()
  await button('上移图片').click()
  assert.equal(await body.locator(':scope > .node-liftInkImage').count(), 1)
  await expect(body.locator(':scope > h2 + .node-liftInkImage + p')).toHaveText('Export test body')
  await button('裁剪图片').click()
  await drawBox(page.getByRole('img', { name: '待裁剪图片' }))
  await button('应用裁剪').click()
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeLessThan(100)
  await button('区域截图').click()
  await drawBox(page.getByRole('img', { name: '当前屏幕截图' }))
  await button('贴入笔记').click()
  await expect(body.getByRole('img', { name: '区域截图' })).toBeVisible()
  await expect(image).toBeVisible()
  await page.keyboard.press('Control+s')
  const status = page.locator('.markdown-editor [role=status]')
  await expect(status).toContainText('已保存')
  await app.evaluate(({ dialog }, directory) => {
    dialog.showSaveDialog = async (_owner, options) => ({ canceled: false, filePath: `${directory}\\${options.defaultPath}` })
  }, root)
  await button('导出 Markdown').click()
  await expect(status).toHaveText('已导出 Markdown')
  const markdown = await readFile(join(root, 'Markdown media fixture.md'), 'utf8')
  assert.match(markdown, /^# Markdown media fixture/)
  assert.match(markdown, /## Semantic section/)
  assert.equal((markdown.match(/data:image\/png;base64,/g) ?? []).length, 2)
  await button('导出 PDF').click()
  await expect(status).toHaveText('已导出 PDF')
  const printed = await PDFDocument.load(await readFile(join(root, 'Markdown media fixture.pdf')))
  assert(printed.getPageCount() >= 1)
  assert(printed.context.enumerateIndirectObjects().filter(([, value]) =>
    value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')).length >= 2)
  await unlink(pdfPath)
  await unlink(pngPath)
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await button('查看全部').click()
  await openRow('Markdown media fixture')
  body = page.getByRole('textbox', { name: 'Markdown 正文' })
  await expect(body.getByRole('img', { name: 'Real image.png' })).toBeVisible()
  await expect(body.getByRole('img', { name: '区域截图' })).toBeVisible()
  await button('返回上一页').click()
  await openRow('Mind map fixture')
  await expect(button('分支子主题')).toBeVisible()
  await button('返回').click()
  await openRow('Real PDF')
  await expect(page.getByRole('img', { name: 'PDF 原页' }).first()).toBeVisible()
  assert.equal(await page.evaluate(async () => {
    const index = await window.liftInk.loadNoteIndex()
    const note = index.value.find((note) => note.title === 'Real PDF')
    const document = await window.liftInk.loadDocument(note.id)
    return document.value.pages[0].elements.find((element) => element.kind === 'ink').width
  }), 5.7)
  console.log('Markdown image move, crop, real screenshot, both exports and restart persistence passed.')
} finally {
  if (app) await app.close()
  const path = await realpath(root)
  if (dirname(path) === parent && basename(path).startsWith('liftink-home-media-')) {
    await rm(path, { recursive: true, force: true })
  }
}
