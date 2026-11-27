import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-hold-line-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const app = await electron.launch({
  ...(executablePath ? { executablePath } : { args: ['.'] }),
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
})

try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByLabel('笔记标题').fill('停笔拉直验收')
  const canvas = page.getByLabel('笔记画布').first()
  await canvas.waitFor()
  await canvas.evaluate((element) => Promise.all(element.closest('main').getAnimations().map((animation) => animation.finished)))
  await page.waitForTimeout(300)
  const box = await canvas.boundingBox()
  assert(box)
  const cdp = await page.context().newCDPSession(page)
  let timestamp = Date.now() / 1000
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const pen = (type, x, y) => cdp.send('Input.dispatchMouseEvent', {
    type, x: box.x + x, y: box.y + y, pointerType: 'pen', force: type === 'mouseReleased' ? 0 : 0.5,
    timestamp: timestamp += 0.008, button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1
  })
  const preview = canvas.locator('[data-live-ink="pen"] path')
  await pen('mousePressed', 100, 150)
  await pen('mouseMoved', 122, 156)
  await pen('mouseMoved', 145, 162)
  await pen('mouseMoved', 168, 156)
  await pen('mouseMoved', 190, 150)
  await expect(preview).toHaveCount(1)
  await expect.poll(() => preview.getAttribute('d')).toBeTruthy()
  const curved = await preview.getAttribute('d')
  await page.waitForTimeout(2200)
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await expect(preview).not.toHaveAttribute('d', curved)
  const straight = await preview.getAttribute('d')
  await pen('mouseMoved', 220, 180)
  await expect(preview).not.toHaveAttribute('d', straight)
  await pen('mouseReleased', 220, 180)
  await page.keyboard.press('Control+s')
  await page.getByText('已保存', { exact: true }).waitFor()
  const [id] = await page.evaluate(async () => (await window.liftInk.loadNoteIndex()).value
    .filter((note) => note.documentExpected).map((note) => note.id))
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const load = async () => (await page.evaluate((noteId) => window.liftInk.loadDocument(noteId), id)).value.pages[0].elements
  await expect.poll(async () => (await load()).length).toBe(1)
  const [line] = await load()
  assert.equal(line.points.length, 2, 'held stroke should persist as two endpoints')
  assert(line.points[1].x > line.points[0].x)
  await pen('mousePressed', 260, 150)
  await pen('mouseMoved', 280, 158)
  await pen('mouseMoved', 300, 165)
  await pen('mouseMoved', 320, 158)
  await pen('mouseMoved', 340, 150)
  await pen('mouseReleased', 340, 150)
  await page.keyboard.press('Control+s')
  await expect.poll(async () => (await load()).length).toBe(2)
  assert((await load())[1].points.length > 2, 'stroke released before two seconds should remain freehand')
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await load()).length).toBe(1)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await load()).length).toBe(0)
  await page.keyboard.press('Control+y')
  await expect.poll(async () => (await load()).length).toBe(1)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await page.locator('.note-card').filter({ hasText: '停笔拉直验收' }).click()
  await expect(page.getByLabel('笔记画布').first().locator('path')).toHaveCount(1)
  assert.equal((await load())[0].points.length, 2)
  await cdp.detach()
  console.log('Hold-to-straighten passed: preview, endpoint adjustment, quick freehand, save, undo/redo and reopen')
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
