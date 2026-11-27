import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-geometry-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const app = await electron.launch({
  ...(executablePath ? { executablePath } : { args: ['.'] }),
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
})
try {
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('button', { name: /8 像素笔宽/ }).click()
  const canvas = page.getByLabel('笔记画布')
  const cdp = await page.context().newCDPSession(page)
  const box = await canvas.boundingBox()
  assert(box)
  let time = Date.now() / 1000
  const pen = (type, x, y, force) => cdp.send('Input.dispatchMouseEvent', {
    type, x: box.x + x, y: box.y + y, force, pointerType: 'pen', timestamp: time += 0.008,
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1
  })
  const draw = async (samples) => {
    await pen('mousePressed', ...samples[0])
    for (const sample of samples.slice(1)) await pen('mouseMoved', ...sample)
    await pen('mouseReleased', ...samples.at(-1).slice(0, 2), 0)
  }
  await draw(Array.from({ length: 10 }, (_, i) => [100 + 4 * i, 130, 0.18]))
  await draw([[100, 175, 0.18], [103, 175, 0.18]])
  await draw([[100, 220, 0.18]])
  await draw(Array.from({ length: 10 }, (_, i) => [100 + 4 * i, 260, i === 9 ? 0.98 : 0.18]))
  await expect(canvas.locator('path')).toHaveCount(4)
  await expect(canvas.locator('path').first()).toHaveAttribute('d', /C/)
  const [long, short, dot, impulse] = await canvas.locator('path').evaluateAll((paths) => paths.map((path) => {
    const box = path.getBBox()
    return { height: box.height, width: box.width, x: box.x, y: box.y }
  }))
  const dotCenter = await canvas.evaluate((element, [x, y]) => {
    const matrix = element.getScreenCTM().inverse()
    return new DOMPoint(x, y).matrixTransform(matrix).toJSON()
  }, [box.x + 100, box.y + 220])
  const failures = []
  if (short.height > long.height * 1.12) failures.push(`短划宽度 ${short.height.toFixed(2)}，长划 ${long.height.toFixed(2)}`)
  const dotOffset = Math.hypot(dot.x + dot.width / 2 - dotCenter.x, dot.y + dot.height / 2 - dotCenter.y)
  if (dotOffset > 0.18) failures.push(`点的墨心偏离 ${dotOffset.toFixed(2)}`)
  if (impulse.height > long.height * 1.12) failures.push(`末端压力脉冲宽度 ${impulse.height.toFixed(2)}，基准 ${long.height.toFixed(2)}`)
  assert.deepEqual(failures, [])

  const hook = [[225, 130, 0.32], [235, 130, 0.35], [249, 130, 0.37],
    [249, 143, 0.4], [249, 155, 0.41], [244, 161, 0.32], [239, 156, 0.27]]
  await pen('mousePressed', ...hook[0])
  for (const sample of hook.slice(1)) await pen('mouseMoved', ...sample)
  const preview = canvas.locator('[data-live-ink="pen"] path')
  await expect(preview).toHaveCount(1)
  await pen('mouseReleased', ...hook.at(-1).slice(0, 2), 0)
  await expect(preview).toHaveCount(0)
  await expect(canvas.locator('path')).toHaveCount(5)
  const committed = canvas.locator('path').last()
  assert(await committed.evaluate((path, [[ox, oy], points]) => {
    const inverse = path.ownerSVGElement.getScreenCTM().inverse()
    return points.every(([x, y]) => path.isPointInFill(new DOMPoint(ox + x, oy + y).matrixTransform(inverse)))
  }, [[box.x, box.y], hook]), '横折和回钩的接缝应保持连续')

  await page.getByRole('button', { name: '笔刷设置' }).click()
  await page.getByRole('button', { name: '笔迹对照' }).click()
  const comparison = page.getByRole('dialog', { name: '笔迹对照' })
  await expect(comparison.getByRole('img')).toHaveCount(4)
  const currentPath = comparison.getByRole('img', { name: '新版轮廓' }).locator('path')
  await expect(currentPath).toHaveAttribute('d', await committed.getAttribute('d'))
  const savePath = join(root, 'stroke.json')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, savePath)
  await comparison.getByRole('button', { name: '保存采样' }).click()
  await expect(comparison.getByRole('status')).toHaveText('已保存采样')
  const replay = JSON.parse(await readFile(savePath, 'utf8'))
  assert.equal(replay.samples.length, hook.length)
  assert.equal(replay.release.pressure, 0)
  assert(replay.samples.every((sample) => Number.isFinite(sample.time)))
  await comparison.locator('input[type=file]').setInputFiles(savePath)
  await expect(comparison.getByRole('status')).toHaveText('已载入采样')
  await expect(currentPath).toHaveAttribute('d', await committed.getAttribute('d'))
  if (process.env.LIFTINK_TEST_SCREENSHOTS === '1') {
    await comparison.screenshot({ path: 'screenshots/ink-comparison.png', scale: 'css' })
  }
  console.log(`Ink geometry passed: short/long ${(short.height / long.height).toFixed(2)}, dot offset ${dotOffset.toFixed(2)}, pressure impulse ${(impulse.height / long.height).toFixed(2)}.`)
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
