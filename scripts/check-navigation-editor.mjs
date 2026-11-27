import { strict as assert } from 'node:assert'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-navigation-check-'))
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
})
try {
  const page = await app.firstWindow()
  await page.waitForSelector('.note-card')

  await page.getByRole('button', { name: '展开 工作项目', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'LiftInk', exact: true }).count(), 1)
  await page.getByRole('button', { name: '工作项目', exact: true }).click()
  const folder = page.getByRole('region', { name: '文件夹目录' })
  await folder.getByRole('button', { name: 'LiftInk 文件夹' }).click()
  await folder.getByRole('button', { name: '交互设计 文件夹' }).click()
  await folder.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
  assert.equal(await folder.locator('.recent-file-row').count(), 1)
  await folder.getByRole('button', { name: /产品设计思考 用户洞察/ }).click()
  await page.getByRole('region', { name: '笔记页面' }).waitFor()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await folder.getByRole('heading', { name: '交互设计', exact: true }).waitFor()

  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByRole('region', { name: '笔记页面' }).waitFor({ state: 'visible' })
  assert.equal(await page.getByRole('region', { name: '笔记页面' }).isVisible(), true)
  assert.equal(await page.getByRole('textbox', { name: '笔记标题' }).inputValue(), '未命名笔记')
  assert.match(await page.getByRole('button', { name: '笔记位置' }).innerText(), /未分类/)
  assert.equal(await page.getByRole('complementary', { name: '页面缩略图目录' }).count(), 0)
  await page.getByRole('button', { name: '展开页面缩略图' }).click()
  assert.equal(await page.getByRole('complementary', { name: '页面缩略图目录' }).isVisible(), true)
  await page.getByRole('button', { name: '新增页面' }).click()
  assert.equal(await page.getByText('第 2 / 2 页').count(), 1)
  await page.getByRole('button', { name: '收起页面缩略图' }).click()
  await page.getByRole('button', { name: '钢笔', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: '钢笔', exact: true }).getAttribute('aria-pressed'),
    'true'
  )
  await page.getByRole('textbox', { name: '笔记标题' }).fill('交互草稿')
  await page.keyboard.press('Control+s')
  await page.getByText('已保存', { exact: true }).waitFor()
  await page.getByRole('button', { name: '返回上一页' }).click()
  await folder.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
  assert.equal(await folder.locator('.recent-file-row').count(), 1)
  await folder.getByRole('button', { name: '返回上一级' }).click()
  await folder.getByRole('heading', { name: 'LiftInk', exact: true }).waitFor()

  await page.getByRole('button', { name: '首页', exact: true }).click()
  await page.getByRole('button', { name: '查看全部', exact: true }).click()
  assert.equal(await page.getByRole('region', { name: '最近文件列表' }).isVisible(), true)
  assert.equal(await page.locator('.recent-file-row').count(), 7)
  await page.getByRole('button', { name: 'PDF', exact: true }).click()
  assert.equal(await page.locator('.recent-file-row').count(), 2)
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  assert.equal(await page.locator('.recent-file-row').count(), 5)
  await page.locator('.recent-file-row').first().click()
  assert.equal(await page.getByRole('region', { name: '笔记页面' }).isVisible(), true)
  await page.getByRole('button', { name: '返回上一页' }).click()
  assert.equal(await page.getByRole('region', { name: '最近文件列表' }).isVisible(), true)
  console.log('Navigation passed: nested folders, new note page, page manager, recent files view')
} finally {
  await app.close()
  const resolved = await realpath(dataDir)
  const tempRoot = await realpath(tmpdir())
  if (dirname(resolved) === tempRoot && basename(resolved).startsWith('liftink-navigation-check-'))
    await rm(resolved, { recursive: true, force: true })
  else {
    process.stderr.write(`拒绝清理非测试目录：${resolved}\n`)
    process.exitCode = 1
  }
}
