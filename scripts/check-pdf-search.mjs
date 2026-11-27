import { strict as assert } from 'node:assert'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const [filename, query, expectedPages] = process.argv.slice(2)
assert(filename && query && Number(expectedPages) > 1, 'Usage: node scripts/check-pdf-search.mjs <pdf> <query> <page count>')
const pdf = resolve(filename)
const parent = await realpath(tmpdir())
const root = await mkdtemp(join(parent, 'liftink-pdf-search-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: root }
let app

try {
  app = await electron.launch({ args: ['.'], env })
  let page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByLabel('笔记标题').fill('PDF search fixture')
  await page.getByLabel('笔记画布').first().waitFor()
  await page.locator('input[type=file][accept*="application/pdf"]').setInputFiles(pdf)
  console.log('Import started.')
  await page.getByLabel('笔记画布').nth(Number(expectedPages) - 1).waitFor({ timeout: 240_000 })
  assert.equal(await page.getByLabel('笔记画布').count(), Number(expectedPages))
  console.log(`Imported ${expectedPages} pages.`)

  await page.keyboard.press('Control+f')
  let search = page.getByRole('searchbox', { name: '搜索 PDF 原文' })
  await search.fill(query)
  let results = page.locator('.editor-pdf-search-results button')
  await results.first().waitFor({ timeout: 90_000 })
  const firstLabel = await results.first().locator('strong').innerText()
  const firstNumber = Number(firstLabel.match(/\d+/)?.[0])
  assert(firstNumber >= 1 && firstNumber < Number(expectedPages))
  await results.first().click()
  let mark = page.locator('.editor-pdf-search-mark').first()
  await mark.waitFor()
  const hitPageId = await mark.evaluate((element) => element.closest('[data-page]').dataset.page)
  assert.equal(await page.locator('.editor-paper.current').getAttribute('data-page'), hitPageId)
  if (await results.count() > 1) {
    await page.getByRole('button', { name: '下一个 PDF 命中' }).click()
    assert.equal(await results.nth(1).getAttribute('aria-current'), 'true')
    await results.first().click()
  }
  await page.getByRole('button', { name: '放大画布' }).click()
  await results.first().click()
  await page.getByRole('button', { name: '钢笔', exact: true }).click()
  await mark.scrollIntoViewIfNeeded()
  const box = await mark.boundingBox()
  assert(box && box.width > 0 && box.height > 0)
  const canvas = page.locator(`[data-page="${hitPageId}"] .editor-live-canvas`)
  const paths = await canvas.locator('path').count()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 4, { steps: 3 })
  await page.mouse.up()
  assert.equal(await canvas.locator('path').count(), paths + 1)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.editor-pdf-search-mark').count(), 0)
  await page.getByRole('button', { name: '展开页面缩略图' }).click()
  await page.getByRole('button', { name: `第 ${firstNumber} 页下移`, exact: true }).click()
  await page.keyboard.press('Control+f')
  search = page.getByRole('searchbox', { name: '搜索 PDF 原文' })
  await search.fill(query)
  const movedHit = page.locator('.editor-pdf-search-results button').filter({
    has: page.getByText(`第 ${firstNumber + 1} 页`, { exact: true })
  }).first()
  await movedHit.click()
  assert.equal(await mark.evaluate((element) => element.closest('[data-page]').dataset.page), hitPageId)
  console.log('Verified search navigation, zoom, ink and page reorder.')
  await app.close()

  app = await electron.launch({ args: ['.'], env })
  page = await app.firstWindow()
  await page.getByRole('button', { name: '查看全部', exact: true }).click()
  await page.locator('.recent-file-row').filter({ hasText: 'PDF search fixture' }).click()
  await page.getByLabel('笔记画布').nth(Number(expectedPages) - 1).waitFor({ timeout: 90_000 })
  await page.keyboard.press('Control+f')
  search = page.getByRole('searchbox', { name: '搜索 PDF 原文' })
  await search.fill(query)
  results = page.locator('.editor-pdf-search-results button')
  await results.filter({ has: page.getByText(`第 ${firstNumber + 1} 页`, { exact: true }) }).first().click({ timeout: 90_000 })
  mark = page.locator('.editor-pdf-search-mark').first()
  assert.equal(await mark.evaluate((element) => element.closest('[data-page]').dataset.page), hitPageId)
  assert.equal(await page.locator(`[data-page="${hitPageId}"] .editor-live-canvas path`).count(), paths + 1)
  await search.fill('zzz_liftink_fixture_no_match_zzz')
  await page.getByText('没有匹配的原文', { exact: false }).waitFor()
  assert.equal(await page.locator('.editor-pdf-search-mark').count(), 0)
  console.log(`PDF search passed after restart, including ${expectedPages} imported pages and persisted ink.`)
} finally {
  if (app) await app.close()
  const target = await realpath(root)
  if (dirname(target) === parent && basename(target).startsWith('liftink-pdf-search-')) {
    await rm(target, { recursive: true, force: true })
  }
}
