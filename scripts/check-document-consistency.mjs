import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-consistency-check-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
const orphanId = 'orphan-note'
const missingId = 'missing-document-note'
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const note = (id, title) => ({
  id,
  title,
  originalTitle: `new-${id}`,
  date: '刚刚',
  tags: [],
  kind: 'blank',
  folder: '未分类',
  summary: '一致性测试',
  favorite: false,
  documentExpected: true
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function launch() {
  const app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  return { app, page }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function run() {
  let { app, page } = await launch()
  try {
    await page.getByRole('button', { name: '新建笔记' }).waitFor()
    await page.evaluate((entry) => window.liftInk.initializeNote(entry), note(orphanId, '孤立笔记'))
    const initialized = await page.evaluate((id) => window.liftInk.loadDocument(id), orphanId)
    assert.equal(initialized.value.noteId, orphanId)
    assert.equal(initialized.value.pages.length, 1)
    const orphanPath = join(dataDir, 'notes', `${orphanId}.json`)
    await rename(orphanPath, `${orphanPath}.bak`)
    await page.evaluate(
      (entries) => window.liftInk.saveNoteIndex(entries),
      [note(missingId, '缺失文档测试笔记')]
    )
    const index = await page.evaluate(() => window.liftInk.loadNoteIndex())
    assert.equal(
      index.value.some((entry) => entry.id === orphanId),
      true
    )
    assert.equal(
      index.value.some((entry) => entry.id === missingId),
      true
    )
    assert.equal(index.orphanCount, 1)
  } finally {
    await app.close()
  }

  ;({ app, page } = await launch())
  try {
    await page.getByText('恢复的笔记 orphan-n').first().click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    await page.getByLabel('笔记画布').waitFor()
    await page
      .getByRole('alert')
      .getByText(/已从备份恢复/)
      .waitFor()
    await page.getByRole('button', { name: '返回上一页' }).click()
    await page.getByText('缺失文档测试笔记').first().click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    await page
      .getByRole('alert')
      .getByText(/笔记文档缺失，已阻止创建空白页/)
      .waitFor()
    await page.evaluate(() => window.liftInk.loadNoteIndex())
    const missing = await page.evaluate((id) => window.liftInk.loadDocument(id), missingId)
    assert.equal(missing.value, null)
    const stored = JSON.parse(await readFile(join(dataDir, 'index.json'), 'utf8'))
    assert(stored.notes.some((entry) => entry.id === orphanId))
    assert(stored.notes.some((entry) => entry.id === missingId))
    console.log(
      'Document consistency passed: orphan discovery, visible recovery, missing-document guard'
    )
  } finally {
    await app.close()
  }
}

try {
  await run()
} finally {
  const resolved = await realpath(dataDir)
  const tempRoot = await realpath(tmpdir())
  if (dirname(resolved) === tempRoot && basename(resolved).startsWith('liftink-consistency-check-'))
    await rm(resolved, { recursive: true, force: true })
  else {
    process.stderr.write(`拒绝清理非测试目录：${resolved}\n`)
    process.exitCode = 1
  }
}
