import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const savedId = 'crash-saved-note'
const orphanId = 'crash-orphan-note'
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const record = (id) => ({
  id,
  title: id === savedId ? '异常退出前已保存' : '未列入目录的笔记',
  originalTitle: `new-${id}`,
  date: '刚刚',
  tags: [],
  kind: 'blank',
  folder: '未分类',
  summary: '异常退出恢复测试',
  favorite: false,
  documentExpected: true
})

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function crashWorker(dataDir) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
  })
  const page = await app.firstWindow()
  await page.getByRole('button', { name: '新建笔记' }).waitFor()
  await page.evaluate(() => window.liftInk.loadNoteIndex())
  await page.evaluate((entry) => window.liftInk.initializeNote(entry), record(savedId))
  await page.evaluate((entries) => window.liftInk.saveNoteIndex(entries), [record(savedId)])
  const loaded = await page.evaluate((id) => window.liftInk.loadDocument(id), savedId)
  const changed = {
    ...loaded.value,
    pages: [
      {
        ...loaded.value.pages[0],
        elements: [
          {
            kind: 'ink',
            id: 'saved-stroke',
            color: '#433654',
            width: 4,
            points: [
              { x: 100, y: 100, pressure: 0.4 },
              { x: 150, y: 120, pressure: 0.8 }
            ]
          }
        ]
      }
    ]
  }
  await page.evaluate((document) => window.liftInk.saveDocument(document), changed)
  await page.evaluate((entry) => window.liftInk.initializeNote(entry), record(orphanId))
  const exited = once(app.process(), 'exit')
  app.process().kill()
  await Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Electron 未能结束')), 5000))
  ])
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function runParent() {
  const dataDir = await mkdtemp(join(tmpdir(), 'liftink-crash-check-'))
  try {
    const worker = spawn(process.execPath, [fileURLToPath(import.meta.url), 'worker', dataDir], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let stderr = ''
    worker.stderr.on('data', (data) => {
      stderr += String(data)
    })
    const [exitCode] = await once(worker, 'exit')
    assert.equal(exitCode, 0, stderr)

    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
    })
    try {
      const page = await app.firstWindow()
      const index = await page.evaluate(() => window.liftInk.loadNoteIndex())
      assert(index.value.some((entry) => entry.id === savedId))
      assert(index.value.some((entry) => entry.id === orphanId))
      assert.equal(index.value.find((entry) => entry.id === orphanId).folder, '未分类')
      const saved = await page.evaluate((id) => window.liftInk.loadDocument(id), savedId)
      assert.equal(saved.value.pages[0].elements[0].id, 'saved-stroke')
      const orphan = await page.evaluate((id) => window.liftInk.loadDocument(id), orphanId)
      assert.equal(orphan.value.pages.length, 1)
      console.log(
        'Crash recovery passed: confirmed ink and unindexed document survived process termination'
      )
    } finally {
      await app.close()
    }
  } finally {
    const resolved = await realpath(dataDir)
    const tempRoot = await realpath(tmpdir())
    if (dirname(resolved) === tempRoot && basename(resolved).startsWith('liftink-crash-check-'))
      await rm(resolved, { recursive: true, force: true })
    else {
      process.stderr.write(`拒绝清理非测试目录：${resolved}\n`)
      process.exitCode = 1
    }
  }
}

if (process.argv[2] === 'worker') {
  await crashWorker(process.argv[3])
  process.exit(0)
} else {
  await runParent()
}
