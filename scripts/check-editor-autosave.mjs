import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-autosave-'))
const launch = () => electron.launch({
  args: ['.'],
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
})

let app
try {
  app = await launch()
  const page = await app.firstWindow()
  await page.clock.install()
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByLabel('笔记标题').fill('手写自动保存')
  await page.keyboard.press('Control+s')
  await page.getByText('已保存', { exact: true }).waitFor()
  const records = () => page.evaluate(async () => (await window.liftInk.loadNoteIndex()).value)
  await expect.poll(async () => (await records())?.some((note) => note.title === '手写自动保存')).toBe(true)
  const { id } = (await records()).find((note) => note.title === '手写自动保存')
  const read = (view = page) => view.evaluate(async (noteId) => (
    await window.liftInk.loadDocument(noteId)
  ).value.pages[0].elements, id)
  const canvas = page.getByLabel('笔记画布')
  await canvas.evaluate((element) => Promise.all(
    element.closest('main').getAnimations().map((animation) => animation.finished)
  ))
  const box = await canvas.boundingBox()
  assert(box)
  const cdp = await page.context().newCDPSession(page)
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', {
    type, x: box.x + x, y: box.y + y, pointerType: 'pen', force: 0.5,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1
  })
  const stroke = async (y, wheel = false) => {
    await pen('mousePressed', 120, y)
    await pen('mouseMoved', 150, y)
    if (wheel) {
      await page.mouse.wheel(0, 95)
      await page.clock.runFor(200)
    }
    await pen('mouseMoved', 195, y)
    await pen('mouseReleased', 215, y)
  }
  const initialTop = box.y
  await stroke(125, true)
  const moved = Math.abs((await canvas.boundingBox()).y - initialTop)
  await stroke(170)
  await page.clock.runFor(500)
  const earlyWrites = (await read()).length
  assert.equal(earlyWrites, 0, '单笔写入触发了磁盘保存')
  assert(moved < 0.5, `落笔中纸面移动了 ${moved}px`)
  await page.clock.fastForward(30_000)
  await stroke(215)
  await page.clock.fastForward(30_000)
  await expect.poll(async () => (await read()).length).toBe(3)
  const [first] = await read()
  assert(first.points.every((point) => Math.abs(point.y - first.points[0].y) < 0.5))

  await stroke(255)
  await page.keyboard.press('Control+s')
  await expect.poll(async () => (await read()).length).toBe(4)
  await stroke(295)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await expect.poll(async () => (await read()).length).toBe(5)
  await page.locator('.note-card').filter({ hasText: '手写自动保存' }).click()
  await canvas.waitFor()
  await stroke(330)
  await cdp.detach()
  await app.close()
  app = await launch()
  const reopened = await app.firstWindow()
  await expect.poll(async () => (await read(reopened)).length).toBe(6)
  await reopened.getByRole('button', { name: '新建笔记' }).click()
  await reopened.getByLabel('笔记标题').fill('关闭窗口保存新草稿')
  const draftCanvas = reopened.getByLabel('笔记画布')
  await draftCanvas.click({ position: { x: 150, y: 140 } })
  assert(!(await reopened.evaluate(async () => (await window.liftInk.loadNoteIndex()).value))
    .some((note) => note.title === '关闭窗口保存新草稿'))
  await app.close()
  app = await launch()
  const draftReopened = await app.firstWindow()
  await expect.poll(() => draftReopened.evaluate(async () => {
    const { value } = await window.liftInk.loadNoteIndex()
    const note = value.find((entry) => entry.title === '关闭窗口保存新草稿')
    if (!note) return 0
    const document = await window.liftInk.loadDocument(note.id)
    return document.value.pages[0].elements.length
  })).toBe(1)
  console.log('Autosave passed: stable pen coordinates, one-minute batching, Ctrl+S, navigation and window-close flush.')
} finally {
  await app?.close()
  await rm(root, { recursive: true, force: true })
}
