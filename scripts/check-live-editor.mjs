import { strict as assert } from 'node:assert'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-editor-check-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function selectionImageBox(dialog, altText) {
  const image = dialog.getByAltText(altText)
  await image.evaluate(async (element) => {
    await element.decode()
    await Promise.all(element.closest('.editor-capture-dialog').getAnimations().map((animation) => animation.finished))
  })
  const box = await image.boundingBox()
  assert(box)
  return box
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function expectSelection(dialog, image, startX, startY, endX, endY) {
  const selection = dialog.locator('.editor-capture-selection')
  await expect(selection).toBeVisible()
  const box = await selection.boundingBox()
  assert(box)
  assert(Math.abs(box.x - (image.x + Math.min(startX, endX))) < 2)
  assert(Math.abs(box.y - (image.y + Math.min(startY, endY))) < 2)
  assert(Math.abs(box.width - Math.abs(endX - startX)) < 2)
  assert(Math.abs(box.height - Math.abs(endY - startY)) < 2)
  await expect(selection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(selection).toHaveCSS('box-shadow', /rgba\(17, 15, 26, 0\.62\)/)
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function launch() {
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  return { app, page }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function run() {
  let { app, page } = await launch()
  let noteId
  let croppedAssetId
  try {
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    await page.getByLabel('笔记标题').fill('编辑器验收笔记')
    await page.keyboard.press('Control+s')
    await page.getByText('已保存', { exact: true }).waitFor()
    const records = await page.evaluate(() => window.liftInk.loadNoteIndex())
    noteId = records.value.find((item) => item.title === '编辑器验收笔记')?.id
    assert(noteId)
    const canvas = page.getByLabel('笔记画布')
    const box = await canvas.boundingBox()
    assert(box)
    const pen = page.getByRole('button', { name: '钢笔', exact: true })
    await pen.hover()
    await expect(page.getByRole('tooltip')).toHaveText('钢笔在纸上自由书写或绘画。')
    const pressure = page.getByRole('button', { name: '钢笔压感' })
    await expect(pressure).toHaveAttribute('aria-pressed', 'true')
    await pressure.click()
    await expect(pressure).toHaveAttribute('aria-pressed', 'false')
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen',
      x: box.x + 130, y: box.y + 180, force: 0.15
    })
    for (let i = 1; i <= 12; i++)
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', buttons: 1, pointerType: 'pen',
        x: box.x + 130 + i * 12, y: box.y + 180 + Math.sin(i) * 12, force: i / 12
      })
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen',
      x: box.x + 274, y: box.y + 180 + Math.sin(12) * 12
    })
    await cdp.detach()
    assert.equal(await canvas.locator('path').count(), 1)
    await page.getByRole('button', { name: '撤销' }).click()
    assert.equal(await canvas.locator('path').count(), 0)
    await page.getByRole('button', { name: '重做' }).click()
    assert.equal(await canvas.locator('path').count(), 1)
    await page.keyboard.down('Space')
    await page.mouse.move(box.x + 400, box.y + 300)
    await page.mouse.down()
    await page.mouse.move(box.x + 420, box.y + 320)
    await page.mouse.up()
    await page.keyboard.up('Space')
    assert.equal(await canvas.locator('path').count(), 1)
    await page.getByRole('button', { name: '墨色 #202124' }).click()
    const palette = page.getByRole('dialog', { name: '选择墨色' })
    await palette.getByRole('button', { name: '藤紫' }).click()
    await expect(palette).toBeHidden()
    await expect(page.getByRole('button', { name: '墨色 #7461ba' })).toBeVisible()
    await page.keyboard.down('Alt')
    await page.mouse.click(box.x + 190, box.y + 180 + Math.sin(5) * 12)
    await page.keyboard.up('Alt')
    assert.equal(await page.getByRole('button', { name: '墨色 #202124' }).count(), 1)
    await page.getByRole('button', { name: '橡皮擦' }).click()
    await page.getByRole('button', { name: '橡皮大小 24 像素' }).click()
    await page.getByRole('dialog', { name: '选择橡皮大小' }).getByRole('button', { name: '40 px' }).click()
    await page.mouse.move(box.x + 190, box.y + 180)
    await expect(canvas.locator('.editor-eraser-outline')).toHaveAttribute('r', '20')
    await page.mouse.click(box.x + 190, box.y + 180 + Math.sin(5) * 12)
    assert((await canvas.locator('path').count()) >= 1, '局部橡皮擦应保留未擦除的笔段')
    await page.getByRole('button', { name: '撤销' }).click()
    assert.equal(await canvas.locator('path').count(), 1)
    await page.getByRole('button', { name: '荧光笔', exact: true }).click()
    await page.getByRole('button', { name: '荧光笔颜色' }).click()
    await page.getByRole('dialog', { name: '选择荧光颜色' }).getByRole('button', { name: '荧光粉' }).click()
    await page.mouse.move(box.x + 160, box.y + 380)
    await page.mouse.down()
    await page.mouse.move(box.x + 330, box.y + 380, { steps: 6 })
    const highlight = canvas.locator('path[fill="#ff38b5"]')
    await expect(highlight).toHaveAttribute('opacity', '0.52')
    await page.mouse.up()
    await expect(highlight).toHaveAttribute('opacity', '0.52')
    await pen.click()
    await expect(page.getByRole('button', { name: '墨色 #202124' })).toBeVisible()
    const imageData = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 180
      canvas.height = 120
      const context = canvas.getContext('2d')
      context.fillStyle = '#e9d9fa'
      context.fillRect(0, 0, 180, 120)
      context.fillStyle = '#7059c6'
      context.fillRect(25, 20, 130, 80)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    await page.locator('.editor-file-input').first().setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(imageData, 'base64')
    })
    await canvas.locator('image').waitFor()
    assert.equal(await canvas.locator('image').count(), 1)
    await page.getByRole('button', { name: '撤销' }).click()
    assert.equal(await canvas.locator('image').count(), 0)
    await page.getByRole('button', { name: '重做' }).click()
    assert.equal(await canvas.locator('image').count(), 1)
    const savedImage = async () => (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId))
      .value.pages[0].elements.find((item) => item.kind === 'image')
    await expect.poll(async () => Boolean(await savedImage())).toBe(true)
    const imported = await savedImage()
    const imageX = box.x + ((imported.x + 50) * box.width) / 750
    const imageY = box.y + ((imported.y + 50) * box.height) / 980
    await page.mouse.move(imageX, imageY)
    await page.mouse.down()
    await page.mouse.move(imageX + 36, imageY + 24, { steps: 4 })
    await page.mouse.up()
    await expect.poll(async () => (await savedImage())?.x).toBeGreaterThan(imported.x)
    const moved = await savedImage()
    const resizeX = box.x + ((moved.x + moved.width) * box.width) / 750 - 2
    const resizeY = box.y + ((moved.y + moved.height) * box.height) / 980 - 2
    await page.mouse.move(resizeX, resizeY)
    await page.mouse.down()
    await page.mouse.move(resizeX + 40, resizeY + 28, { steps: 4 })
    await page.mouse.up()
    await expect.poll(async () => (await savedImage())?.width).toBeGreaterThan(moved.width)
    const currentWidth = Number(await canvas.locator('image').getAttribute('width'))
    const crop = page.getByRole('button', { name: '裁剪图片' })
    await crop.click()
    const cropDialog = page.getByRole('dialog', { name: '裁剪图片' })
    await expect(cropDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cropDialog).toBeHidden()
    await crop.click()
    const cropBox = await selectionImageBox(cropDialog, '待裁剪图片')
    await page.mouse.move(cropBox.x + cropBox.width * 3 / 4, cropBox.y + cropBox.height * 3 / 4)
    await page.mouse.down()
    await page.mouse.move(cropBox.x + cropBox.width / 4, cropBox.y + cropBox.height / 4, { steps: 5 })
    await expectSelection(cropDialog, cropBox, cropBox.width * 3 / 4, cropBox.height * 3 / 4, cropBox.width / 4, cropBox.height / 4)
    await page.mouse.up()
    const sizeLabel = await cropDialog.getByText(/\d+ × \d+ 像素 · 可拖动重选/).innerText()
    const expectedSize = sizeLabel.match(/\d+/g).map(Number)
    assert(Math.abs(expectedSize[0] - 90) <= 1 && Math.abs(expectedSize[1] - 60) <= 1, sizeLabel)
    const preview = await cropDialog.getByAltText('待裁剪图片').screenshot()
    const { inside, outside } = await page.evaluate(async (data) => {
      const image = new Image()
      image.src = 'data:image/png;base64,' + data
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      return {
        inside: [...context.getImageData(image.width * 0.5, image.height / 2, 1, 1).data],
        outside: [...context.getImageData(image.width * 0.2, image.height / 2, 1, 1).data]
      }
    }, preview.toString('base64'))
    assert.deepEqual(inside, [112, 89, 198, 255], '框内应保留原图颜色')
    assert(outside[2] < inside[2] - 60, '框外同色区域应明显压暗')
    await cropDialog.getByRole('button', { name: '应用裁剪' }).click()
    await expect(cropDialog).toBeHidden()
    const croppedWidth = Number(await canvas.locator('image').getAttribute('width'))
    assert(Math.abs(croppedWidth / currentWidth - 0.5) < 0.04)
    const croppedPng = await canvas.locator('image').getAttribute('href')
    const pngSize = Buffer.from(croppedPng.split(',')[1], 'base64')
    assert.deepEqual([pngSize.readUInt32BE(16), pngSize.readUInt32BE(20)], expectedSize)
    await page.getByRole('button', { name: '撤销' }).click()
    assert.equal(Number(await canvas.locator('image').getAttribute('width')), currentWidth)
    await page.getByRole('button', { name: '重做' }).click()
    assert.equal(Number(await canvas.locator('image').getAttribute('width')), croppedWidth)
    await page.screenshot({ path: 'screenshots/live-editor-1440x900.png', scale: 'css' })
    for (const [width, height] of [
      [1366, 768],
      [1920, 1080]
    ]) {
      await (
        await app.browserWindow(page)
      ).evaluate((window, size) => window.setContentSize(size.width, size.height), {
        width,
        height
      })
      const metrics = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth
      }))
      assert.equal(metrics.width, metrics.scrollWidth)
      await page.screenshot({
        path: `screenshots/live-editor-${width}x${height}.png`,
        scale: 'css',
        clip: { x: 0, y: 0, width, height }
      })
    }
    await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
    const samplePinPromise = app.waitForEvent('window')
    await page.getByRole('button', { name: '贴到桌面' }).click()
    const samplePin = await samplePinPromise
    assert.equal(
      await (await app.browserWindow(samplePin)).evaluate((window) => window.isAlwaysOnTop()),
      true
    )
    await samplePin.screenshot({ path: 'screenshots/live-pin-window.png', scale: 'css' })
    await (await app.browserWindow(samplePin)).evaluate((window) => window.close())
    await page.getByRole('button', { name: '展开页面缩略图' }).click()
    await page.getByRole('button', { name: '新增页面' }).click()
    assert.match(await page.locator('.editor-statusbar').innerText(), /第 2 \/ 2 页/)
    await page.getByRole('button', { name: '撤销' }).click()
    assert.match(await page.locator('.editor-statusbar').innerText(), /第 2 \/ 1 页|第 1 \/ 1 页/)
    await page.getByRole('button', { name: '区域截图' }).click()
    const screenshotDialog = page.getByRole('dialog', { name: '区域截图' })
    await screenshotDialog.waitFor({ timeout: 10000 })
    let imageBox = await selectionImageBox(screenshotDialog, '当前屏幕截图')
    await page.mouse.move(imageBox.x + 30, imageBox.y + 30)
    await page.mouse.down()
    await page.mouse.move(imageBox.x + 170, imageBox.y + 130, { steps: 5 })
    await page.mouse.up()
    await expectSelection(screenshotDialog, imageBox, 30, 30, 170, 130)
    await page
      .getByRole('dialog', { name: '区域截图' })
      .getByRole('button', { name: '贴入笔记' })
      .click()
    await page.getByRole('dialog', { name: '区域截图' }).waitFor({ state: 'hidden' })
    assert.equal(await canvas.locator('image').count(), 2)
    await page.getByRole('button', { name: '区域截图' }).click()
    await page.getByRole('dialog', { name: '区域截图' }).waitFor({ timeout: 10000 })
    imageBox = await selectionImageBox(screenshotDialog, '当前屏幕截图')
    await page.mouse.move(imageBox.x + 30, imageBox.y + 30)
    await page.mouse.down()
    await page.mouse.move(imageBox.x + 150, imageBox.y + 120, { steps: 5 })
    await page.mouse.up()
    await page
      .getByRole('dialog', { name: '区域截图' })
      .getByRole('button', { name: '贴到桌面' })
      .click()
    await page.getByRole('dialog', { name: '区域截图' }).waitFor({ state: 'hidden' })
    assert.equal((await app.windows()).length, 2)
    assert.equal(
      await (
        await app.browserWindow((await app.windows())[1])
      ).evaluate((window) => window.isAlwaysOnTop()),
      true
    )
    await page.getByRole('button', { name: '文本', exact: true }).click()
    const textBox = await canvas.boundingBox()
    assert(textBox)
    const x = textBox.x + 160
    const y = textBox.y + 420
    await page.mouse.click(x, y)
    const prompt = page.getByRole('dialog', { name: '输入文本' })
    await prompt.getByLabel('文本内容').fill('可移动的文本')
    await prompt.getByRole('button', { name: '确定' }).click()
    const text = canvas.locator('text[data-text-id]')
    await expect(text).toHaveText('可移动的文本')
    await page.mouse.click(x + 460, y + 20)
    await expect(page.getByRole('button', { name: '编辑文本' })).toHaveCount(0)
    const beforeX = Number(await text.getAttribute('x'))
    await page.mouse.move(x + 15, y + 8)
    await page.mouse.down()
    await page.mouse.move(x + 60, y + 14, { steps: 5 })
    await page.mouse.up()
    assert(Number(await text.getAttribute('x')) > beforeX + 20)
    await text.dblclick()
    await prompt.getByLabel('文本内容').fill('编辑后的文本')
    await prompt.getByRole('button', { name: '确定' }).click()
    await expect(text).toHaveText('编辑后的文本')
    await page.getByRole('button', { name: '撤销' }).click()
    await expect(text).toHaveText('可移动的文本')
    await page.getByRole('button', { name: '重做' }).click()
    await expect(text).toHaveText('编辑后的文本')
    const fontSize = Number(await text.getAttribute('font-size'))
    const textBox = canvas.locator('[data-text-box-hit]')
    const [widthBefore, heightBefore] = await Promise.all(['width', 'height'].map(async (key) => Number(await textBox.getAttribute(key))))
    const textHandle = await canvas.getByLabel('调整文本框宽高', { exact: true }).boundingBox()
    assert(textHandle)
    const handleX = textHandle.x + textHandle.width / 2
    const handleY = textHandle.y + textHandle.height / 2
    await page.mouse.move(handleX, handleY)
    await page.mouse.down()
    await page.mouse.move(handleX + 40, handleY + 14, { steps: 5 })
    await page.mouse.up()
    assert(Number(await textBox.getAttribute('width')) > widthBefore)
    assert(Number(await textBox.getAttribute('height')) > heightBefore)
    assert.equal(Number(await text.getAttribute('font-size')), fontSize)
    await expect(canvas.locator('path').first()).toHaveAttribute('fill', '#ff38b5')
    await page.getByText('已保存', { exact: true }).waitFor()
    const stored = (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)).value
    const elements = stored.pages[0].elements
    assert.equal(elements.length, 5)
    const penStroke = elements.find((item) => item.brush === 'pen')
    assert.equal(penStroke.pressureSensitive, false)
    assert(new Set(penStroke.points.map((point) => point.pressure)).size > 1)
    assert.equal(elements.find((item) => item.brush === 'highlighter').color, '#ff38b5')
    croppedAssetId = elements.find((item) => item.id === imported.id).assetId
    assert.notEqual(croppedAssetId, imported.assetId)
  } finally {
    await app.close()
  }

  ;({ app, page } = await launch())
  try {
    await page.getByText('编辑器验收笔记').first().click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    const canvas = page.getByLabel('笔记画布')
    await expect(canvas.locator('path')).toHaveCount(2)
    await expect(canvas.locator('image')).toHaveCount(2)
    await expect(canvas.locator('text[data-text-id]')).toHaveText('编辑后的文本')
    const saved = (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)).value
    assert(saved.pages[0].elements.some((item) => item.assetId === croppedAssetId))
    const image = await page.evaluate((id) => window.liftInk.loadImage(id), croppedAssetId)
    assert(image.dataUrl.startsWith('data:image/png;base64,'))
    console.log(
      'Live editor passed: tooltips, palettes, pressure toggle, eraser size, text movement and edits, image crop, undo/redo, restart, page action, screenshot pin'
    )
  } finally {
    await app.close()
  }
}
try {
  await run()
} finally {
  const resolved = await realpath(dataDir)
  const tempRoot = await realpath(tmpdir())
  if (dirname(resolved) === tempRoot && basename(resolved).startsWith('liftink-editor-check-'))
    await rm(resolved, { recursive: true, force: true })
  else {
    process.stderr.write(`拒绝清理非测试目录：${resolved}\n`)
    process.exitCode = 1
  }
}
