import { strict as assert } from 'node:assert'
import { _electron as electron } from '@playwright/test'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-pen-check-'))
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
})
try {
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('button', { name: '输入测试' }).click()
  const lab = page.getByRole('region', { name: '数位板输入测试' })
  assert.equal(await lab.isVisible(), true)
  const canvas = page.locator('.pen-poc-canvas-host canvas')
  const box = await canvas.boundingBox()
  assert(box)
  const x = box.x + 140,
    y = box.y + 140
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + i * 12, y + Math.sin(i * 0.5) * 15)
  await page.mouse.up()
  await page.getByText('笔迹 1 条', { exact: false }).waitFor()
  assert.match(await page.locator('.pen-poc-readout').innerText(), /mouse/)

  await canvas.evaluate((element) =>
    element.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'pen',
        pointerId: 72,
        buttons: 0,
        pressure: 0,
        clientX: element.getBoundingClientRect().left + 200,
        clientY: element.getBoundingClientRect().top + 180
      })
    )
  )
  assert.match(await page.locator('.pen-poc-readout').innerText(), /pen/)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: x + 100,
    y: y + 90,
    pointerType: 'pen',
    force: 0
  })
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x + 100,
    y: y + 90,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'pen',
    force: 0.2
  })
  await page.waitForTimeout(100)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: x + 180,
    y: y + 110,
    button: 'left',
    buttons: 1,
    pointerType: 'pen',
    force: 0.8
  })
  assert.match(await page.locator('.pen-poc-readout').innerText(), /0.800/)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x + 180,
    y: y + 110,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen',
    force: 0
  })
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 2 条/)
  assert.match(await page.locator('.pen-poc-readout').innerText(), /0\.20–0\.80/)
  await canvas.evaluate((element) =>
    element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'pen',
        pointerId: 72,
        button: 2,
        buttons: 2,
        pressure: 0.5,
        clientX: element.getBoundingClientRect().left + 200,
        clientY: element.getBoundingClientRect().top + 180
      })
    )
  )
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 2 条/)
  await mkdir('screenshots', { recursive: true })
  await page.screenshot({
    path: 'screenshots/pen-input-poc-1440x900.png',
    animations: 'disabled',
    scale: 'css',
    clip: { x: 0, y: 0, width: 1440, height: 900 }
  })

  await page.keyboard.down('Space')
  await page.mouse.move(x + 70, y + 80)
  await page.mouse.down()
  await page.mouse.move(x + 100, y + 100)
  await page.mouse.up()
  await page.keyboard.up('Space')
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 2 条/)
  assert.match(await page.locator('.pen-poc-header').innerText(), /工具已恢复/)

  await page.getByRole('combobox', { name: '轮廓方式' }).selectOption('freehand')
  await page.getByRole('button', { name: '1000 条' }).click()
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 1000 条/)
  await page.waitForTimeout(450)
  const frameText = await page.locator('.pen-poc-measure').innerText()
  assert.match(frameText, /单帧重绘 [\d.]+ ms/)
  await page.getByRole('button', { name: '5000 条' }).click()
  await page.waitForTimeout(450)
  const stressText = await page.locator('.pen-poc-measure').innerText()
  assert.match(stressText, /笔迹 5000 条/)
  await page.getByRole('combobox', { name: '轮廓方式' }).selectOption('segments')
  await page.waitForTimeout(300)
  const segmentText = await page.locator('.pen-poc-measure').innerText()
  await page.getByRole('button', { name: '清空' }).click()
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 0 条/)

  await page.getByRole('combobox', { name: '采样事件' }).selectOption('raw')
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: x + 100,
    y: y + 100,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'pen',
    force: 0.4
  })
  const rawPointerId = Number(
    await page.locator('.pen-poc-readout div').last().locator('strong').innerText()
  )
  await canvas.evaluate((element, pointerId) => {
    const rect = element.getBoundingClientRect()
    element.dispatchEvent(
      new PointerEvent('pointerrawupdate', {
        bubbles: true,
        pointerType: 'pen',
        pointerId,
        buttons: 1,
        pressure: 0.7,
        clientX: rect.left + 200,
        clientY: rect.top + 160
      })
    )
  }, rawPointerId)
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: x + 200,
    y: y + 160,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'pen',
    force: 0
  })
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 1 条 · 采样点 [2-9]/)
  await page.getByRole('combobox', { name: '采样事件' }).selectOption('move')
  await page.getByRole('button', { name: '清空' }).click()

  await page.getByRole('button', { name: /100%/ }).click()
  await page.getByRole('button', { name: '墨色 #c96f91' }).click()
  await page.mouse.move(x + 100, y + 100)
  await page.mouse.down()
  await page.mouse.move(x + 180, y + 100, { steps: 8 })
  await page.mouse.up()
  await page.getByRole('button', { name: '墨色 #433654' }).click()
  await page.keyboard.down('Alt')
  await page.mouse.click(x + 140, y + 100)
  await page.keyboard.up('Alt')
  assert.match(
    await page.getByRole('button', { name: '墨色 #c96f91' }).getAttribute('class'),
    /active/
  )

  await page.getByRole('button', { name: '套索' }).click()
  await page.mouse.move(x + 75, y + 75)
  await page.mouse.down()
  for (const [px, py] of [
    [x + 205, y + 75],
    [x + 205, y + 125],
    [x + 75, y + 125],
    [x + 75, y + 75]
  ])
    await page.mouse.move(px, py, { steps: 4 })
  await page.mouse.up()
  assert.match(await page.locator('.pen-poc-measure').innerText(), /选中 1 条/)
  await page.keyboard.press('Delete')
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 0 条/)

  await page.getByRole('button', { name: '钢笔' }).click()
  await page.mouse.move(x + 100, y + 100)
  await page.mouse.down()
  await page.mouse.move(x + 180, y + 100, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: '橡皮擦' }).click()
  await page.mouse.click(x + 140, y + 100)
  assert.match(await page.locator('.pen-poc-measure').innerText(), /笔迹 0 条/)

  await page.mouse.move(x + 200, y + 200)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -120)
  await page.keyboard.up('Control')
  assert.notEqual(await page.locator('.pen-poc-footer button').innerText(), '100%')

  await page.getByRole('button', { name: '返回笔记' }).click()
  assert.equal(await page.getByRole('region', { name: '笔记页面' }).isVisible(), true)
  console.log(
    'Pen PoC passed: mouse and CDP pen strokes, pressure, hover/side diagnostic, Space restore, freehand benchmark, clear',
    { frameText, stressText, segmentText }
  )
} finally {
  await app.close()
}
const resolved = await realpath(dataDir)
const tempRoot = await realpath(tmpdir())
if (dirname(resolved) !== tempRoot || !basename(resolved).startsWith('liftink-pen-check-'))
  throw new Error('拒绝清理非测试目录')
await rm(resolved, { recursive: true, force: true })
