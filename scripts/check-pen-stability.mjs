import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-pen-stability-'))
const app = await electron.launch({ args: ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: '新建笔记' }).click()
  const canvas = page.getByLabel('笔记画布')
  await canvas.waitFor()
  await canvas.evaluate((element) => Promise.all(
    element.closest('main').getAnimations().map((animation) => animation.finished)
  ))
  const box = await canvas.boundingBox()
  assert(box)
  const cdp = await page.context().newCDPSession(page)
  let timestamp = Date.now() / 1000
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const pen = (type, x, y, force = 0.5) => cdp.send('Input.dispatchMouseEvent', {
    type, x: box.x + x, y: box.y + y, pointerType: 'pen', force, timestamp: timestamp += 0.008,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mouseMoved' ? 0 : 1
  })
  await pen('mousePressed', 100, 140)
  await pen('mouseMoved', 120, 140)
  assert(await canvas.locator('circle').evaluateAll((circles) =>
    circles.every((circle) => Number(circle.getAttribute('r')) <= 2 && circle.getAttribute('stroke-width') === '0')))
  await pen('mouseReleased', 160, 140)
  await expect(canvas.locator('path')).toHaveCount(1)
  await pen('mousePressed', 220, 180, 0.01)
  await pen('mouseReleased', 220, 180)
  await pen('mousePressed', 260, 180, 0.35)
  await pen('mouseReleased', 260, 180)
  await page.keyboard.press('Control+s')
  await page.getByText('已保存', { exact: true }).waitFor()
  const [id] = await page.evaluate(async () => (await window.liftInk.loadNoteIndex()).value
    .filter((note) => note.documentExpected).map((note) => note.id))
  const [stroke, ...dots] = await page.evaluate(async (noteId) =>
    (await window.liftInk.loadDocument(noteId)).value.pages[0].elements, id)
  const tailX = stroke.points.at(-1).x * box.width / 750
  const problems = []
  if (tailX < 156) problems.push(`笔尖释放在 x=160，存储笔尾 x=${tailX.toFixed(1)}`)
  if (dots.length !== 1) problems.push(`轻触杂点和有效点共存储 ${dots.length} 个，期望 1 个`)
  assert.deepEqual(problems, [])
  assert.equal(dots[0].points.length, 1)
  const button = (name) => page.getByRole('button', { name, exact: true })
  await button('笔刷设置').click()
  await button('软头笔').click()
  await page.getByRole('slider', { name: '压感曲线' }).fill('0.65')
  await page.keyboard.press('Escape')
  await pen('mousePressed', 300, 160, 0.15)
  await pen('mouseMoved', 350, 170, 0.7)
  await pen('mouseReleased', 375, 175)
  await page.keyboard.press('Control+s')
  const loadElements = async () => (await page.evaluate((noteId) => window.liftInk.loadDocument(noteId), id)).value.pages[0].elements
  await expect.poll(async () => (await loadElements()).at(-1)).toMatchObject({ penStyle: 'brush', pressureCurve: 0.65 })
  const beforeErase = await canvas.locator('path').first().getAttribute('d')
  await button('橡皮擦').click()
  await page.mouse.move(box.x + 120, box.y + 140)
  await expect(canvas.locator('.editor-eraser-outline')).toBeVisible()
  await page.mouse.down()
  await expect(canvas.locator('path').first()).not.toHaveAttribute('d', beforeErase)
  assert.deepEqual((await loadElements())[0], stroke, '抬起橡皮前不应提交擦除')
  await page.mouse.up()
  await page.keyboard.press('Control+s')
  await expect.poll(async () => (await loadElements())[0]).not.toEqual(stroke)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await loadElements())[0]).toEqual(stroke)

  await button('遮挡胶带').click()
  await page.mouse.move(box.x + 170, box.y + 210)
  await page.mouse.down()
  await page.mouse.move(box.x + 260, box.y + 238, { steps: 5 })
  await page.mouse.up()
  const tape = canvas.locator('[data-tape-id]')
  await expect(tape).toBeVisible()
  const oldX = Number(await tape.getAttribute('x'))
  const oldWidth = Number(await tape.getAttribute('width'))
  await button('选择').click()
  await page.mouse.move(box.x + 205, box.y + 223)
  await page.mouse.down()
  await page.mouse.move(box.x + 230, box.y + 241, { steps: 5 })
  await page.mouse.up()
  assert(Number(await tape.getAttribute('x')) > oldX + 10)
  const handle = await canvas.getByLabel('拖动调整胶带大小').boundingBox()
  assert(handle)
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 20, handle.y + handle.height / 2 + 10, { steps: 5 })
  await page.mouse.up()
  assert(Number(await tape.getAttribute('width')) > oldWidth + 10)

  const paperWidth = (await canvas.boundingBox()).width
  await page.mouse.move(box.x + 280, box.y + 250)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -160)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await canvas.boundingBox()).width).toBeGreaterThan(paperWidth)
  const viewport = canvas.locator('xpath=../..')
  const scrollTop = await viewport.evaluate((element) => element.scrollTop)
  await page.keyboard.down('Space')
  await page.mouse.down()
  await page.mouse.move(box.x + 280, box.y + 190, { steps: 5 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollTop)
  await cdp.detach()
  console.log('Pen stability passed: release endpoint, noise filtering, cursor, pressure curve, live eraser/undo, tape resize/move, Ctrl-wheel and Space pan')
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
