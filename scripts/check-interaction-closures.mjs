import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, realpath, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import JSZip from 'jszip'

const temp = await realpath(tmpdir())
const root = await mkdtemp(join(temp, 'liftink-workflow-'))
const packaged = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = (dir) => electron.launch({ executablePath: packaged, env: { ...process.env, LIFTINK_TEST_DATA_DIR: dir },
  args: [...(packaged ? [] : ['.']), '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const backup = join(root, 'workspace.liftink')
let app
let page
const button = (name) => page.getByRole('button', { name, exact: true })
const index = () => page.evaluate(async () => (await window.liftInk.loadNoteIndex()).value ?? [])
const saveDialog = (filePath) => app.evaluate(({ dialog }, path) => {
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
}, filePath)
const setWindow = async () => {
  page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
}
try {
  app = await launch(join(root, 'source'))
  await setWindow()
  const today = await page.evaluate(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() }))
  await expect(page.locator('.selected-day')).toHaveText(String(today.day))
  await expect(page.getByText('今日日程', { exact: false }).first()).toBeVisible()
  assert.deepEqual(await index(), [])

  await button('新建思维导图').click()
  const map = page.locator('.mindmap-node.root')
  await map.dblclick()
  await page.locator('.mindmap-node input').fill('迁移导图橘木')
  await page.locator('.mindmap-node input').press('Enter')
  await button('返回').click()
  await button('新建思维导图').click()
  await expect(map).toContainText('迁移导图橘木')
  await button('保存到未分类').click()
  await expect.poll(async () => (await index()).some((note) => note.draft?.mindMap?.[0].label === '迁移导图橘木')).toBe(true)

  await button('首页').click()
  await button('语音速记').click()
  await button('开始录音').click()
  await expect(button('停止录音')).toBeVisible()
  await page.waitForTimeout(500)
  await button('返回').click()
  await button('语音速记').click()
  await expect(page.getByLabel('语音速记录音')).toBeVisible()
  await button('开始录音').click()
  await expect(button('停止录音')).toBeVisible()
  await page.waitForTimeout(500)
  await button('停止录音').click()
  await expect(page.getByLabel('选择速记录音').locator('option')).toHaveCount(2)
  await page.getByLabel('速记文字').fill('速记独有栗子词')
  await button('保存到未分类').click()
  await expect.poll(async () => (await index()).find((note) => note.kind === 'voice')?.draft?.recordings?.length).toBe(2)

  await button('首页').click()
  await button('导入 PDF/图片').click()
  const markdown = join(root, '迁移文档.md')
  await writeFile(markdown, '# 独有标题\n\n正文风铃索引 **加粗词**\n')
  await page.locator('.import-workspace input[type=file]').setInputFiles(markdown)
  await expect(page.getByLabel('Markdown 正文')).toContainText('正文风铃索引')
  await expect(page.getByLabel('Markdown 正文').locator('strong')).toHaveText('加粗词')
  await button('返回上一页').click()
  await page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' }).fill('风铃索引')
  await expect(page.getByRole('option', { name: /迁移文档.*笔记正文/ })).toBeVisible()
  await button('标签').click()
  await page.getByLabel('搜索标签笔记').fill('风铃索引')
  await expect(page.getByText('迁移文档', { exact: true })).toBeVisible()
  await expect(page.getByText('语音速记', { exact: true })).toHaveCount(0)

  await button('首页').click()
  await button('查看全部日程').click()
  await button('新增目标').click()
  await page.getByLabel('目标名称').fill('迁移练习目标')
  await page.getByLabel('关联笔记').selectOption({ label: '迁移文档' })
  await button('保存目标').click()
  await button('新增日程').click()
  await page.getByPlaceholder('输入日程内容').fill('迁移关联练习')
  await page.getByLabel('关联笔记').selectOption({ label: '迁移文档' })
  await page.getByLabel('关联目标').selectOption({ label: '迁移练习目标' })
  await button('添加日程').click()
  await button('打开关联笔记').click()
  await expect(page.getByLabel('Markdown 正文')).toContainText('正文风铃索引')
  await button('返回上一页').click()
  await button('完成 迁移关联练习').click()
  await expect(button('迁移练习目标')).toHaveAttribute('aria-pressed', 'true')

  await button('设置').click()
  await page.getByRole('button', { name: /^通用/ }).click()
  await page.getByLabel('显示名称').fill('测试资料')
  await page.getByRole('button', { name: /^文件与备份/ }).click()
  await page.getByLabel('名称', { exact: true }).fill('研究归档')
  await button('保存分区').click()
  await expect(button('研究归档')).toBeVisible()
  await page.getByLabel('选择分区').selectOption('研究归档')
  await page.getByLabel('名称', { exact: true }).fill('项目归档')
  await button('保存分区').click()
  await expect(button('项目归档')).toBeVisible()
  await saveDialog(backup)
  await button('导出 .liftink').click()
  await expect(page.getByText('备份已导出', { exact: true })).toBeVisible()
  const zip = await JSZip.loadAsync(await readFile(backup))
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'))
  assert.equal(manifest.entries.length, 3)
  assert.equal(manifest.settings.profile.name, '测试资料')
  assert(manifest.settings.folders.includes('项目归档'))
  for (const item of manifest.entries.find((entry) => entry.note.kind === 'voice').note.draft.recordings) {
    assert(zip.file(`assets/${item.assetId}`))
  }
  const orphan = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 10
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'red'
    ctx.fillRect(0, 0, 10, 10)
    return (await window.liftInk.storeImage('image/png', canvas.toDataURL().split(',')[1])).assetId
  })
  const old = new Date(Date.now() - 32 * 86400_000)
  const orphanPath = join(root, 'source', 'assets', orphan)
  await utimes(orphanPath, old, old)
  const kept = manifest.entries.find((entry) => entry.note.kind === 'voice').note.draft.recordings[0].assetId
  await utimes(join(root, 'source', 'assets', kept), old, old)
  await button('清理无引用附件').click()
  await expect(page.getByText('已清理 1 个无引用附件', { exact: true })).toBeVisible()
  await assert.rejects(stat(orphanPath), { code: 'ENOENT' })
  assert((await stat(join(root, 'source', 'assets', kept))).size > 0)

  const brokenPath = join(root, 'broken.liftink')
  await page.evaluate(async () => {
    const missing = '0'.repeat(64) + '.png'
    const id = 'broken-doc'
    await window.liftInk.saveDocument({ version: 1, noteId: id, pages: [{ id: 'p1', paper: 'blank', elements: [
      { id: 'missing-image', kind: 'image', assetId: missing, x: 0, y: 0, width: 20, height: 20 }
    ] }] })
  })
  await page.reload()
  await expect(page.getByText('找回 1 篇未列入目录的笔记，已放入未分类，请核对内容', { exact: true })).toBeVisible()
  await button('设置').click()
  await page.getByRole('button', { name: /^文件与备份/ }).click()
  await saveDialog(brokenPath)
  await button('导出 .liftink').click()
  await expect(page.getByText(/备份失败.*缺少附件/)).toBeVisible()
  await assert.rejects(stat(brokenPath), { code: 'ENOENT' })

  await app.close()

  app = await launch(join(root, 'destination'))
  await setWindow()
  await button('设置').click()
  await page.locator('input[accept=".liftink"]').setInputFiles(backup)
  await expect(page.getByText('已恢复 3 篇笔记', { exact: true })).toBeVisible()
  const records = await index()
  const restored = records.find((note) => note.kind === 'markdown')
  assert(restored)
  assert.notEqual(restored.id, manifest.entries.find((entry) => entry.note.kind === 'markdown').note.id)
  await expect(button('项目归档')).toBeVisible()
  const readLinks = () => page.evaluate(async () => {
    const settings = await window.liftInk.loadVaultSettings()
    return {
      agenda: JSON.parse(settings['liftink:agenda'])[0],
      goal: JSON.parse(settings['liftink:goals'])[0]
    }
  })
  await expect.poll(async () => (await readLinks()).agenda?.noteId).toBe(restored.id)
  const link = await readLinks()
  assert.equal(link.agenda.noteId, restored.id)
  assert.equal(link.goal.noteId, restored.id)
  assert.equal(link.agenda.goalId, link.goal.id)
  assert.equal(link.goal.done, true)
  const voice = records.find((note) => note.kind === 'voice')
  assert.equal(voice.draft.recordings.length, 2)
  assert(await page.evaluate(async (id) => (await window.liftInk.loadMedia(id)).dataUrl.startsWith('data:audio/webm'), voice.draft.recordings[0].assetId))

  await button('首页').click()
  await page.getByRole('button', { name: /新建笔记/ }).click()
  await page.getByLabel('笔记标题').fill('双开批注')
  await page.keyboard.press('Control+s')
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await button('双开页面').click()
  await page.locator('.editor-dual-config select').first().selectOption(restored.id)
  const companion = page.getByLabel('双开笔记')
  await expect(companion.getByLabel('Markdown 正文')).toContainText('正文风铃索引')
  await companion.getByLabel('Markdown 正文').press('End')
  await companion.getByLabel('Markdown 正文').press('Control+End')
  await page.keyboard.insertText('双开补充')
  await page.keyboard.press('Control+s')
  await expect(companion.getByText('已保存', { exact: true })).toBeVisible()
  console.log('Current date, isolated library, quick draft, multi-recording, Markdown import/search, calendar links, folders, portable restore, missing-asset rejection, safe attachment cleanup and mixed-format editing passed.')
} finally {
  await app?.close().catch(() => undefined)
  const target = await realpath(root)
  if (dirname(target) === temp && basename(target).startsWith('liftink-workflow-')) {
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}
