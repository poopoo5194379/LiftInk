/* eslint @typescript-eslint/explicit-function-return-type: off -- Playwright fixtures use JavaScript callbacks. */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const root = await mkdtemp(join(tmpdir(), 'liftink-app-theme-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () =>
  electron.launch({
    executablePath,
    args: executablePath ? [] : ['.'],
    env: { ...process.env, LIFTINK_TEST_DATA_DIR: root }
  })
let app

try {
  app = await launch()
  let page = await app.firstWindow()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const color = (selector, property) =>
    page
      .locator(selector)
      .first()
      .evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property)
  const setTheme = async (mode, accent) => {
    await button('设置').click()
    await page.getByRole('button', { name: /^外观/ }).click()
    await page.getByLabel('界面主题').selectOption(mode)
    await button(accent).click()
    await expect(button(accent)).toHaveAttribute('aria-pressed', 'true')
    await button('返回首页').click()
  }

  for (const mode of ['light', 'dark']) {
    const samples = []
    for (const accent of ['柔紫', '海蓝', '松绿', '玫红']) {
      await setTheme(mode, accent)
      samples.push(
        await Promise.all([
          color('.app-shell', 'background-image'),
          color('#liftink-sky > stop', 'stop-color'),
          color('.navigation', 'background-image'),
          color('.nav-item.active', 'background-color'),
          color('.new-note', 'background-color'),
          color('.recent.glass', 'background-color'),
        color('.stat-periods button.selected', 'background-color'),
        color('.stat-periods button.selected', 'color'),
        color('.keyword-periods button.selected', 'background-color'),
        color('.keyword-periods button.selected', 'color'),
          color('.section-title .count', 'background-color')
        ])
      )
      const screenshotDir = process.env.LIFTINK_TEST_THEME_SCREENSHOTS
      if (screenshotDir && accent === '松绿') {
        await page.screenshot({
          path: join(screenshotDir, `theme-green-${mode}.png`),
          scale: 'css',
          animations: 'disabled'
        })
      }
    }
    for (const [column, surface] of [
      'homepage',
      'landscape',
      'navigation',
      'selection',
      'button',
      'card',
      'statistics',
      'statistics label',
      'keyword filter',
      'keyword filter label',
      'calendar count'
    ].entries()) {
      assert.equal(
        new Set(samples.map((sample) => sample[column])).size,
        4,
        `${mode} ${surface} should follow the accent`
      )
    }
  }

  await setTheme('light', '海蓝')
  await page.locator('.new-note').click()
  await page.getByLabel('笔记标题').fill('主题测试笔记')
  const canvas = page.getByRole('img', { name: '笔记画布' }).first()
  const box = await canvas.boundingBox()
  assert(box)
  await page.mouse.move(box.x + 140, box.y + 140)
  await page.mouse.down()
  await page.mouse.move(box.x + 225, box.y + 164, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  const before = await Promise.all([
    color('.editor-toolbox', 'background-color'),
    color('.editor-canvas', 'background-color'),
    color('.editor-paper', 'background-color'),
    canvas.locator('path').last().getAttribute('fill')
  ])
  assert(before[3])
  await setTheme('light', '松绿')
  const openNote = () => page.locator('.note-card').filter({ hasText: '主题测试笔记' }).click()
  await openNote()
  const after = await Promise.all([
    color('.editor-toolbox', 'background-color'),
    color('.editor-canvas', 'background-color'),
    color('.editor-paper', 'background-color'),
    canvas.locator('path').last().getAttribute('fill')
  ])
  assert.notEqual(after[0], before[0])
  assert.notEqual(after[1], before[1])
  assert.deepEqual(after.slice(2), before.slice(2))
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await expect.poll(() => color('html', '--liftink-accent')).toBe('#39765a')
  await openNote()
  assert.equal(await color('.editor-toolbox', 'background-color'), after[0])
  console.log(
    'All four themes recolor the home landscape, navigation, controls and surfaces in light and dark mode. Editor chrome, persistence and unchanged paper and ink passed.'
  )
} finally {
  await app?.close()
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
