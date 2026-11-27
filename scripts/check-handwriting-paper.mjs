import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-handwriting-paper-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () => electron.launch({
  ...(executablePath ? { executablePath } : { args: ['.'] }),
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
})
let app
try {
  app = await launch()
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByLabel('笔记标题').fill('书写与纸张回归')
  const canvas = page.getByLabel('笔记画布')
  await canvas.evaluate((element) => Promise.all(
    element.closest('main').getAnimations().map((animation) => animation.finished)
  ))
  const box = await canvas.boundingBox()
  assert(box)
  const cdp = await page.context().newCDPSession(page)
  let timestamp = Date.now() / 1000
  const pen = (type, x, y, pressure = 0.45) => cdp.send('Input.dispatchMouseEvent', {
    type, x: box.x + x, y: box.y + y, timestamp: timestamp += 0.008,
    pointerType: 'pen', force: pressure,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1
  })
  await pen('mousePressed', 100, 120)
  for (let i = 1; i <= 12; i++) await pen('mouseMoved', 100 + i * 3, 120 + (i % 2 ? 1.7 : -1.7))
  await pen('mouseMoved', 139, 120)
  await pen('mouseReleased', 139, 120, 0)
  await pen('mousePressed', 200, 175)
  await pen('mouseMoved', 205, 175)
  await pen('mouseMoved', 253, 241) // isolated coordinate jump during contact
  await pen('mouseMoved', 210, 175)
  await pen('mouseMoved', 215, 175)
  await pen('mouseReleased', 295, 229, 0) // release lands away from the contact
  await pen('mousePressed', 300, 110)
  for (const [x, y] of [[315, 110], [330, 110], [345, 110], [345, 123], [345, 137], [345, 151]]) {
    await pen('mouseMoved', x, y)
  }
  await pen('mouseReleased', 345, 151, 0)
  await page.keyboard.press('Control+s')
  const findId = () => page.evaluate(async () => (await window.liftInk.loadNoteIndex()).value
    ?.find((note) => note.title === '书写与纸张回归')?.id)
  await expect.poll(findId).toBeTruthy()
  const id = await findId()
  const load = (view = page) => view.evaluate(async (noteId) =>
    (await window.liftInk.loadDocument(noteId)).value, id)
  const [jitter, spike, corner] = (await load()).pages[0].elements
  const visibleY = (point) => point.y * box.height / 980
  const visibleX = (point) => point.x * box.width / 750
  const wobble = Math.sqrt(jitter.points.reduce((sum, point) => sum + (visibleY(point) - 120) ** 2, 0) / jitter.points.length)
  const jump = Math.max(...spike.points.map((point) => Math.abs(visibleY(point) - 175)))
  const problem = []
  if (wobble > 1.05) problem.push(`慢速抖动 RMS ${wobble.toFixed(2)}px`)
  if (jump > 2) problem.push(`异常采样或离笔造成 ${jump.toFixed(2)}px 偏移`)
  if (!corner.points.some((point) => Math.hypot(visibleX(point) - 345, visibleY(point) - 110) < 2)) problem.push('快速横折丢失')
  if (Math.abs(visibleY(corner.points.at(-1)) - 151) > 1) problem.push('正常笔尾被截断')
  if (!(await page.getByLabel('纸张间距').count())) problem.push('横线与方格缺少可随纸缩放的间距')
  assert.deepEqual(problem, [])

  const spacing = page.getByLabel('纸张间距')
  const physicalPitch = () => page.locator('.editor-paper-pattern pattern').evaluate((pattern) => {
    const svg = pattern.closest('svg')
    const scale = svg.getScreenCTM()
    return [Number(pattern.getAttribute('width')) * scale.a, Number(pattern.getAttribute('height')) * scale.d]
  })
  assert.equal(await spacing.locator('option').count(), 3)
  await spacing.selectOption('compact')
  const line100 = (await physicalPitch())[1]
  await page.getByRole('button', { name: '放大画布' }).click()
  assert(Math.abs((await physicalPitch())[1] / line100 - 1.25) < 0.005)
  await page.getByRole('button', { name: '方格', exact: true }).click()
  await spacing.selectOption('wide')
  const [gridX, gridY] = await physicalPitch()
  assert(Math.abs(gridX - gridY) < 0.1)
  await page.getByRole('button', { name: '缩小画布' }).click()
  const [gridX100, gridY100] = await physicalPitch()
  assert(Math.abs(gridX / gridX100 - 1.25) < 0.005 && Math.abs(gridY / gridY100 - 1.25) < 0.005)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(spacing).toHaveValue('compact')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(spacing).toHaveValue('wide')
  if (process.env.LIFTINK_TEST_SCREENSHOTS === '1') {
    await page.screenshot({ path: 'screenshots/handwriting-paper-1440x900.png', scale: 'css' })
  }
  await page.keyboard.press('Control+s')
  await expect.poll(async () => (await load()).pages[0].paperSpacing).toBe('wide')
  await cdp.detach()
  await app.close()
  app = await launch()
  const reopened = await app.firstWindow()
  await reopened.locator('.note-card').filter({ hasText: '书写与纸张回归' }).click()
  await expect(reopened.getByLabel('纸张间距')).toHaveValue('wide')
  await expect(reopened.getByRole('button', { name: '方格', exact: true })).toHaveAttribute('aria-pressed', 'true')
  assert.deepEqual((await load(reopened)).pages[0].elements, [jitter, spike, corner])
  console.log(`Handwriting and paper passed: wobble RMS ${wobble.toFixed(2)}px, coordinate jump ${jump.toFixed(2)}px, corner, zoom, and restart.`)
} finally {
  await app?.close()
  await rm(root, { recursive: true, force: true })
}
