import { strict as assert } from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-workspaces-check-'))
const app = await electron.launch({ args: ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir } })
try {
  const page = await app.firstWindow()
  await page.waitForSelector('.note-card')
  await page.getByRole('button', { name: '标签', exact: true }).click()
  assert.equal(await page.getByRole('region', { name: '标签页面' }).isVisible(), true)
  await page.getByRole('button', { name: /设计 1/ }).click()
  assert.equal(await page.locator('.tags-note-list .tag-note-open').count(), 1)
  await page.getByRole('button', { name: '首页', exact: true }).click()
  assert.equal(await page.locator('.note-card').count(), 4)

  await page.getByRole('button', { name: '查看全部日程' }).click()
  assert.equal(await page.getByRole('region', { name: '日程详情页面' }).isVisible(), true)
  assert.equal(await page.locator('.agenda-detail-item').count(), 3)
  await page.getByRole('button', { name: '完成 项目周会' }).click()
  assert.equal(await page.getByText('1 / 3 项').count(), 1)
  await page.getByRole('button', { name: '返回首页' }).click()

  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('region', { name: '笔记页面' }).waitFor({ state: 'visible' })
  assert.match(await page.getByRole('button', { name: '笔记位置' }).innerText(), /未分类/)
  await page.getByRole('button', { name: '笔记位置' }).click()
  await page.getByRole('textbox', { name: '搜索分区' }).fill('视觉研究')
  await page.getByRole('option', { name: /视觉研究/ }).click()
  assert.match(await page.getByRole('button', { name: '笔记位置' }).innerText(), /视觉研究/)
  await page.getByRole('button', { name: '返回上一页' }).click()

  await page.getByRole('button', { name: '语音速记', exact: true }).click()
  assert.equal(await page.getByRole('region', { name: '语音速记页面' }).isVisible(), true)
  await page.getByRole('textbox', { name: '速记文字' }).fill('今天讨论了新的首页布局。')
  await page.getByRole('button', { name: '保存到未分类' }).click()
  assert.equal(await page.getByRole('region', { name: '最近文件列表' }).isVisible(), true)
  await page.locator('.recent-file-row').first().click()
  assert.equal(
    await page.getByRole('textbox', { name: '速记文字' }).inputValue(),
    '今天讨论了新的首页布局。'
  )
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '返回首页' }).click()

  if (!(await page.getByRole('button', { name: '新建思维导图', exact: true }).isVisible())) {
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
  }
  await page.getByRole('button', { name: '新建思维导图', exact: true }).click()
  await page.getByRole('button', { name: '添加子主题' }).click()
  assert.equal(await page.locator('.mindmap-node input').count(), 1)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('button', { name: '新建白板' }).click()
  await page.getByRole('button', { name: '添加文字块' }).click()
  assert.equal(await page.locator('.whiteboard-canvas textarea').count(), 2)
  await page.getByRole('button', { name: '返回', exact: true }).click()

  await page.getByRole('button', { name: '导入 PDF/图片' }).click()
  assert.equal(await page.getByRole('region', { name: '导入 PDF / 图片页面' }).isVisible(), true)
  assert.equal(await page.locator('.import-workspace input[type=file][multiple]').count(), 1)
  console.log(
    'Workspaces passed: Home, Tags, agenda, folder picker, voice, map, board and import entry'
  )
} finally {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
}
