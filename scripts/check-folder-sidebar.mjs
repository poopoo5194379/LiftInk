import { strict as assert } from 'node:assert'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'

const temp = await realpath(tmpdir())
const data = await mkdtemp(join(temp, 'liftink-folder-sidebar-'))
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
let app
let page
const button = (name) => page.getByRole('button', { name, exact: true })
const folderName = () => page.getByRole('textbox', { name: '文件夹名称' })
const heading = (name) => page.getByRole('heading', { name, exact: true })
const manage = (path) => button(`管理文件夹 ${path}`)
const notePath = () => page.evaluate(async () => {
  const { value } = await window.liftInk.loadNoteIndex()
  return value?.find((note) => note.title === '目录回归笔记')?.folder
})
const strokes = () => page.evaluate(async () => {
  const { value } = await window.liftInk.loadNoteIndex()
  const note = value?.find((record) => record.title === '目录回归笔记')
  return note ? (await window.liftInk.loadDocument(note.id)).value?.pages[0]?.elements : undefined
})
const launch = async () => {
  app = await electron.launch({ executablePath, args: executablePath ? [] : ['.'],
    env: { ...process.env, LIFTINK_TEST_DATA_DIR: data } })
  page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1366, 768))
}

try {
  await launch()
  await expect(manage('未分类')).toHaveCount(0)
  await button('新建文件夹').click()
  await folderName().fill('项目档案')
  await folderName().press('Enter')
  await expect(heading('项目档案')).toBeVisible()

  await page.locator('.folder-item').filter({ hasText: '项目档案' }).click({ button: 'right' })
  await button('新建子文件夹').click()
  await folderName().fill('资料')
  await button('创建文件夹').click()
  await expect(heading('资料')).toBeVisible()
  await expect(manage('项目档案 / 资料')).toBeVisible()

  await button('新建笔记').click()
  await page.getByLabel('笔记标题').fill('目录回归笔记')
  const canvas = page.getByLabel('笔记画布')
  await canvas.evaluate((element) => Promise.all(element.closest('main').getAnimations().map((animation) => animation.finished)))
  const box = await canvas.boundingBox()
  assert(box)
  await page.mouse.move(box.x + 120, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 190, box.y + 116, { steps: 10 })
  await page.mouse.up()
  await page.keyboard.press('Control+s')
  await expect.poll(notePath).toBe('未分类')
  await expect.poll(async () => (await strokes())?.length).toBe(1)
  const originalStrokes = await strokes()
  await button('返回上一页').click()
  await button('未分类').click()
  await button('目录回归笔记 更多操作').click()
  await button('移动到').click()
  await page.getByLabel('目标文件夹').selectOption('项目档案 / 资料')
  await page.getByRole('dialog').getByRole('button', { name: /确认移动|移动/ }).click()
  await expect.poll(notePath).toBe('项目档案 / 资料')

  await manage('项目档案').click()
  await button('重命名').click()
  await folderName().fill('   ')
  await button('保存名称').click()
  await expect(page.getByRole('alert')).toHaveText('请输入文件夹名称')
  await folderName().fill('个人')
  await button('保存名称').click()
  await expect(page.getByRole('alert')).toHaveText('此处已有同名文件夹')
  await folderName().fill('研究档案')
  await button('保存名称').click()
  await expect(manage('研究档案 / 资料')).toBeVisible()
  await expect.poll(notePath).toBe('研究档案 / 资料')

  await app.close()
  await launch()
  await button('展开 研究档案').click()
  await manage('研究档案 / 资料').click()
  await button('删除文件夹').click()
  await expect(page.getByRole('dialog')).toContainText('里面的笔记会移至「研究档案」')
  await button('取消').click()
  await expect(manage('研究档案 / 资料')).toBeVisible()
  await manage('研究档案 / 资料').click()
  await button('删除文件夹').click()
  await button('确认删除').click()
  await expect.poll(notePath).toBe('研究档案')

  await manage('研究档案').click()
  await button('删除文件夹').click()
  await expect(page.getByRole('dialog')).toContainText('里面的笔记会移至「未分类」')
  await button('确认删除').click()
  await expect.poll(notePath).toBe('未分类')
  await app.close()
  await launch()
  await button('未分类').click()
  await expect(manage('研究档案')).toHaveCount(0)
  await expect(manage('项目档案')).toHaveCount(0)
  await page.locator('.recent-file-row').filter({ hasText: '目录回归笔记' }).click()
  await expect(page.getByLabel('笔记标题')).toHaveValue('目录回归笔记')
  assert.deepEqual(await strokes(), originalStrokes)
  console.log('PASS: sidebar folder CRUD, validation, and note preservation across restarts')
} finally {
  await app?.close().catch(() => {})
  await rm(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
