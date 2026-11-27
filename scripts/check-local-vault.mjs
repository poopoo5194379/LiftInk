import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { open, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const root = await mkdtemp(join(tmpdir(), 'liftink-vault-test-'))
const legacy = join(root, 'legacy')
const moveParent = join(root, 'migrate')
const backup = join(root, 'backups')
const recoveredParent = join(root, 'restore')
const emptyParent = join(root, 'empty')
await Promise.all([legacy, moveParent, backup, recoveredParent, emptyParent].map((path) => mkdir(path)))
const migrated = join(moveParent, 'LiftInk-资料库')
const empty = join(emptyParent, 'LiftInk-资料库')
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const launch = () => electron.launch({ executablePath, args: executablePath ? [] : ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: legacy } })
let app

try {
  app = await launch()
  let page = await app.firstWindow()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const fixtures = {
    'liftink:folders': ['旧分区'],
    'liftink:tags': ['旧标签'],
    'liftink:keyword-stopwords': ['示例'],
    'liftink:agenda': [{ id: 'agenda-1', title: '随库迁移', date: '2026-11-25', time: '', color: '#7656c7', done: false, noteId: 'source-note' }],
    'liftink:goals': [{ id: 'goal-1', title: '随库目标', done: false, noteId: 'source-note' }],
    'liftink:quick-draft:voice:new': { title: '旧草稿', draft: { transcript: '草稿内容', nodes: [], boardItems: [] } }
  }
  await expect(button('设置')).toBeEnabled()
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const encoded = Array.from(await pdf.save())
  const asset = await page.evaluate(async ({ fixtures, encoded }) => {
    for (const [key, value] of Object.entries(fixtures)) localStorage.setItem(key, JSON.stringify(value))
    const asset = await window.liftInk.storePdfSource(new Uint8Array(encoded))
    const note = { id: 'source-note', title: '迁移测试笔记', originalTitle: '迁移测试笔记', date: '', tags: ['旧标签'], folder: '旧分区', summary: '', kind: 'pdf', favorite: false, documentExpected: true }
    await window.liftInk.initializeNote(note, { version: 1, noteId: note.id, sourcePdfId: asset,
      pages: [{ id: 'page-1', paper: 'blank', sourcePdfId: asset, sourcePageNumber: 1, elements: [] }] })
    await window.liftInk.saveNoteIndex([note])
    return asset
  }, { fixtures, encoded })
  await app.close()
  await rm(join(legacy, 'vault-settings.json'))
  await rm(join(legacy, 'liftink-vault.json'))
  if (process.env.LIFTINK_TEST_LARGE_VAULT === '1') {
    const chunk = Buffer.alloc(1024 * 1024)
    const hash = createHash('sha256')
    for (let i = 0; i < 175; ++i) hash.update(chunk)
    const data = await open(join(legacy, 'assets', `${hash.digest('hex')}.webm`), 'wx')
    try { await data.truncate(175 * chunk.length) } finally { await data.close() }
  }

  app = await launch()
  page = await app.firstWindow()
  const settings = async () => {
    await button('设置').click()
    await page.getByRole('button', { name: /^文件与备份/ }).click()
  }
  const choose = (paths) => app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => {
      const path = paths.shift()
      return path ? { canceled: false, filePaths: [path] } : { canceled: true, filePaths: [] }
    }
  }, paths)
  const currentPath = async () => (await page.evaluate(() => window.liftInk.storageInfo())).path
  const displayedPath = () => page.getByRole('region', { name: '本地存储位置' }).locator('.storage-path')
  await expect(page.locator('.note-card').filter({ hasText: '迁移测试笔记' })).toBeVisible()
  const onDisk = JSON.parse(await readFile(join(legacy, 'vault-settings.json'), 'utf8'))
  for (const [key, value] of Object.entries(fixtures)) assert.deepEqual(JSON.parse(onDisk[key]), value)
  await button('设置').click()
  await expect(displayedPath()).toHaveText(legacy)
  await choose([])
  await button('更改存储位置').click()
  await expect(button('更改存储位置')).toBeEnabled()
  assert.equal(await currentPath(), legacy)
  await choose([moveParent])
  await button('更改存储位置').click()
  await expect(page.getByRole('button', { name: '查看全部日程' })).toBeVisible({ timeout: 30000 })
  assert.equal(await currentPath(), migrated)
  assert.deepEqual(await readFile(join(legacy, 'assets', asset)), await readFile(join(migrated, 'assets', asset)))
  assert.equal(JSON.parse(await readFile(join(migrated, 'notes', 'source-note.json'), 'utf8')).noteId, 'source-note')
  await app.close()
  app = await launch()
  page = await app.firstWindow()
  await expect(button('设置')).toBeEnabled()
  assert.equal(await currentPath(), migrated)

  await settings()
  await expect(displayedPath()).toHaveText(migrated)
  await button('返回首页').click()
  await page.locator('.note-card').filter({ hasText: '迁移测试笔记' }).click()
  await expect(page.getByLabel('笔记标题')).toHaveValue('迁移测试笔记')
  await button('返回上一页').click()
  await settings()
  await choose([backup])
  await button('选择备份目录').click()
  await expect(page.locator('.storage-path').last()).toHaveText(backup)
  await button('创建快照').click()
  await expect(page.getByText('资料库快照已保存并校验')).toBeVisible({ timeout: 30000 })
  const snapshot = join(backup, (await readdir(backup)).find((name) => name.startsWith('LiftInk-快照-')))
  const list = JSON.parse(await readFile(join(snapshot, 'liftink-snapshot.json'), 'utf8')).files
  assert(list.some((entry) => entry.path === `assets/${asset}`))
  if (process.env.LIFTINK_TEST_LARGE_VAULT === '1') assert(list.reduce((total, entry) => total + entry.bytes, 0) > 170_000_000)
  await choose([snapshot])
  await button('打开资料库').click()
  await expect(page.getByText(/这是备份快照/)).toBeVisible()
  assert.equal(await currentPath(), migrated)
  const notePath = join(snapshot, 'notes', 'source-note.json')
  const noteBytes = await readFile(notePath)
  await writeFile(notePath, Buffer.concat([noteBytes, Buffer.from('\n')]))
  await choose([snapshot, recoveredParent])
  await button('从快照恢复').click()
  await expect(page.getByText(/文件校验失败/)).toBeVisible({ timeout: 30000 })
  assert.equal(await currentPath(), migrated)
  assert.deepEqual(await readdir(recoveredParent), [])
  await writeFile(notePath, noteBytes)

  await choose([emptyParent])
  await button('创建资料库').click()
  await expect(button('查看全部日程')).toBeVisible({ timeout: 30000 })
  assert.equal(await currentPath(), empty)
  assert(!(await page.evaluate(() => window.liftInk.loadVaultSettings()))['liftink:agenda']?.includes('随库迁移'))
  await settings()
  const snapshotsBeforeAutomatic = (await readdir(backup)).filter((name) => name.startsWith('LiftInk-快照-')).length
  await page.getByLabel('自动快照').selectOption('1')
  await expect.poll(async () => (await readdir(backup)).filter((name) => name.startsWith('LiftInk-快照-')).length).toBe(snapshotsBeforeAutomatic + 1)
  await page.getByLabel('自动快照').selectOption('0')
  await choose([snapshot, recoveredParent])
  await button('从快照恢复').click()
  await expect(page.locator('.note-card').filter({ hasText: '迁移测试笔记' })).toBeVisible({ timeout: 30000 })
  assert((await currentPath()).startsWith(recoveredParent))
  const restored = await page.evaluate(() => window.liftInk.loadVaultSettings())
  for (const [key, value] of Object.entries(fixtures)) assert.deepEqual(JSON.parse(restored[key]), value)
  await settings()
  await choose([legacy])
  await button('打开资料库').click()
  await expect(button('查看全部日程')).toBeVisible({ timeout: 30000 })
  assert.equal(await currentPath(), legacy)

  // Repoint a selected, test-only vault to an unavailable location to simulate an offline drive.
  await settings()
  await choose([migrated])
  await button('打开资料库').click()
  await expect(button('查看全部日程')).toBeVisible({ timeout: 30000 })
  await app.close()
  const parked = join(moveParent, 'temporarily-unavailable')
  await rename(migrated, parked)
  app = await launch()
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '无法打开当前资料库' })).toBeVisible()
  assert(!(await readdir(moveParent)).includes('LiftInk-资料库'))
  await rename(parked, migrated)
  await button('重试打开').click()
  await expect(page.locator('.note-card').filter({ hasText: '迁移测试笔记' })).toBeVisible()

  console.log('Local vault: legacy settings, migration, restart, empty vault isolation, manual and scheduled snapshots, verified recovery, corruption rejection, and unavailable drive recovery passed.')
} finally {
  await app?.close()
  await rm(root, { recursive: true, force: true })
}
