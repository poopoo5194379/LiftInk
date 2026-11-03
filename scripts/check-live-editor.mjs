import { strict as assert } from 'node:assert'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-editor-check-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
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
  try {
    await page.getByRole('button', { name: '新建笔记' }).click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    await page.getByLabel('笔记标题').fill('编辑器验收笔记')
    await page.getByText('已保存', { exact: true }).waitFor()
    const records = await page.evaluate(() => window.liftInk.loadNoteIndex())
    noteId = records.value.find((item) => item.title === '编辑器验收笔记')?.id
    assert(noteId)
    const canvas = page.getByLabel('笔记画布')
    const box = await canvas.boundingBox()
    assert(box)
    await page.mouse.move(box.x + 130, box.y + 180)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++)
      await page.mouse.move(box.x + 130 + i * 12, box.y + 180 + Math.sin(i) * 12)
    await page.mouse.up()
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
    await page.getByRole('button', { name: '墨色 #433654' }).click()
    await page.keyboard.down('Alt')
    await page.mouse.click(box.x + 190, box.y + 180 + Math.sin(5) * 12)
    await page.keyboard.up('Alt')
    assert.equal(await page.getByRole('button', { name: '墨色 #433654' }).count(), 1)
    await page.getByRole('button', { name: '橡皮擦' }).click()
    await page.mouse.click(box.x + 190, box.y + 180 + Math.sin(5) * 12)
    assert.equal(await canvas.locator('path').count(), 0)
    await page.getByRole('button', { name: '撤销' }).click()
    assert.equal(await canvas.locator('path').count(), 1)
    await page.getByRole('button', { name: '钢笔' }).click()
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
    await page.locator('.editor-file-input').setInputFiles({
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
    const beforeMove = (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)).value
    const imported = beforeMove.pages[0].elements.find((item) => item.kind === 'image')
    const imageX = box.x + ((imported.x + 50) * box.width) / 750
    const imageY = box.y + ((imported.y + 50) * box.height) / 980
    await page.mouse.move(imageX, imageY)
    await page.mouse.down()
    await page.mouse.move(imageX + 36, imageY + 24, { steps: 4 })
    await page.mouse.up()
    const afterMove = (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)).value
    const moved = afterMove.pages[0].elements.find((item) => item.id === imported.id)
    assert(moved.x > imported.x)
    const resizeX = box.x + ((moved.x + moved.width) * box.width) / 750 - 2
    const resizeY = box.y + ((moved.y + moved.height) * box.height) / 980 - 2
    await page.mouse.move(resizeX, resizeY)
    await page.mouse.down()
    await page.mouse.move(resizeX + 40, resizeY + 28, { steps: 4 })
    await page.mouse.up()
    const afterResize = (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)).value
    assert(
      afterResize.pages[0].elements.find((item) => item.id === imported.id).width > moved.width
    )
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
    await page.getByRole('dialog', { name: '区域截图' }).waitFor({ timeout: 10000 })
    let imageBox = await page.getByAltText('当前屏幕截图').boundingBox()
    assert(imageBox)
    await page.mouse.move(imageBox.x + 30, imageBox.y + 30)
    await page.mouse.down()
    await page.mouse.move(imageBox.x + 170, imageBox.y + 130, { steps: 5 })
    await page.mouse.up()
    await page
      .getByRole('dialog', { name: '区域截图' })
      .getByRole('button', { name: '贴入笔记' })
      .click()
    await page.getByRole('dialog', { name: '区域截图' }).waitFor({ state: 'hidden' })
    assert.equal(await canvas.locator('image').count(), 2)
    await page.getByRole('button', { name: '区域截图' }).click()
    await page.getByRole('dialog', { name: '区域截图' }).waitFor({ timeout: 10000 })
    imageBox = await page.getByAltText('当前屏幕截图').boundingBox()
    assert(imageBox)
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
    const stored = (await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)).value
    assert.equal(stored.pages[0].elements.length, 3)
  } finally {
    await app.close()
  }

  ;({ app, page } = await launch())
  try {
    await page.getByText('编辑器验收笔记').first().click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    await page.getByLabel('笔记画布').locator('path').waitFor()
    assert.equal(await page.getByLabel('笔记画布').locator('image').count(), 2)
    console.log(
      'Live editor passed: persistence, ink undo/redo, image import undo/redo, page action, screenshot pin'
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
