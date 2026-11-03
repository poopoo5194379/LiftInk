import { strict as assert } from 'node:assert'
import { _electron as electron } from '@playwright/test'

const app = await electron.launch({ args: ['.'] })
try {
  const page = await app.firstWindow()
  await page.waitForSelector('.note-card')

  await page.keyboard.press('Control+k')
  const search = page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' })
  assert.equal(await search.evaluate((input) => document.activeElement === input), true)
  await search.fill('产品设计思考')
  assert.equal(await page.getByRole('listbox', { name: '搜索结果' }).isVisible(), true)
  await search.press('ArrowDown')
  await search.press('ArrowUp')
  await search.press('Enter')
  assert.equal(await page.getByRole('region', { name: '笔记页面' }).isVisible(), true)
  await page.getByRole('button', { name: '返回上一页' }).click()
  await search.fill('设计心理学.pdf')
  await search.press('Enter')
  assert.equal((await page.getByRole('status').textContent())?.includes('内容预览尚未接入'), true)
  await search.fill('设计心理学.pdf')
  await search.press('Escape')
  assert.equal(await page.getByRole('listbox', { name: '搜索结果' }).count(), 0)
  await search.fill('')

  await page.getByRole('button', { name: '取消收藏 产品设计思考' }).click()
  await page.getByRole('button', { name: '常用文件' }).click()
  assert.equal(await page.locator('.note-card').count(), 0)
  await page.getByRole('button', { name: 'Home' }).click()
  assert.equal(await page.locator('.note-card').count(), 4)

  await page.locator('.note-tile').first().hover()
  await page.getByRole('button', { name: '产品设计思考 更多操作' }).click()
  await page.getByRole('button', { name: '重命名' }).click()
  await page.locator('.form-field input').fill('产品设计思考 V2')
  await page.getByRole('button', { name: '保存名称' }).click()
  assert.equal(
    await page.locator('.note-card').first().locator('strong').textContent(),
    '产品设计思考 V2'
  )

  await page.locator('.note-tile').first().hover()
  await page.getByRole('button', { name: '产品设计思考 V2 更多操作' }).click()
  await page.getByRole('button', { name: '移动到' }).click()
  await page.locator('.form-field select').selectOption('个人')
  await page.getByRole('button', { name: '移动到此处' }).click()
  await page.getByRole('button', { name: '个人', exact: true }).click()
  assert.equal(await page.locator('.note-card').count(), 1)
  await page.getByRole('button', { name: 'Home' }).click()
  await page
    .locator('.note-tile')
    .nth(1)
    .dragTo(page.getByRole('button', { name: '课程笔记', exact: true }))
  await page.getByRole('button', { name: '课程笔记', exact: true }).click()
  assert.equal(await page.locator('.note-card').count(), 1)
  await page.getByRole('button', { name: 'Home' }).click()
  await page.locator('.note-tile').filter({ hasText: '项目迭代规划' }).hover()
  await page.getByRole('button', { name: '项目迭代规划 更多操作' }).click()
  await page.getByRole('button', { name: '移入回收站' }).click()
  assert.equal(await page.locator('.note-card').count(), 3)
  await page.getByRole('button', { name: '产品', exact: true }).click()
  assert.equal(await page.locator('.keyword-results > div button').count(), 1)
  await page.getByRole('button', { name: '返回词云' }).click()

  await page.getByRole('button', { name: '新增日程' }).click()
  await page.locator('input[type="time"]').fill('20:00')
  await page.getByPlaceholder('输入日程内容').fill('记录灵感')
  await page.getByRole('button', { name: '添加日程' }).click()
  assert.equal(await page.locator('.agenda-item').count(), 4)
  await page.getByRole('button', { name: '完成 记录灵感' }).click()
  assert.equal(await page.locator('.agenda-item.done').count(), 1)
  await page.getByRole('button', { name: '修改 记录灵感' }).click()
  await page.getByPlaceholder('输入日程内容').fill('整理灵感')
  await page.getByRole('button', { name: '保存修改' }).click()
  assert.equal(await page.getByRole('button', { name: '标记未完成 整理灵感' }).count(), 1)
  await page.getByRole('button', { name: '删除 整理灵感' }).click()
  assert.equal(await page.locator('.agenda-item').count(), 3)

  await page.locator('.stat-periods').getByRole('button', { name: '7 天' }).click()
  assert.equal(await page.getByRole('img', { name: '近 7 天书写趋势折线图' }).count(), 1)
  await page.locator('.stat-periods').getByRole('button', { name: '90 天' }).click()
  assert.equal(await page.getByRole('img', { name: '近 90 天书写趋势折线图' }).count(), 1)
  await page.locator('.chart circle').first().focus()
  assert.equal(await page.locator('.chart-tooltip').isVisible(), true)

  await page.keyboard.press('Control+n')
  assert.equal(await page.getByRole('region', { name: '笔记页面' }).isVisible(), true)
  await page.getByRole('button', { name: '返回上一页' }).click()

  console.log(
    'V0.2 Home interactions passed: search, favorite, rename, move, drag, agenda, chart, shortcut'
  )
} finally {
  await app.close()
}
