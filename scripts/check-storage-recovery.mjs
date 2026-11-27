import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const dataDir = await mkdtemp(join(tmpdir(), 'liftink-storage-check-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: dataDir }
const noteId = 'storage-check-note'
const missingImage = `${'a'.repeat(64)}.png`
const record = {
  id: noteId,
  title: '恢复测试笔记',
  originalTitle: `new-${noteId}`,
  date: '刚刚',
  tags: [],
  kind: 'blank',
  folder: '未分类',
  summary: '第一版',
  favorite: false
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const makeDocument = (id, elements = []) => ({
  version: 1,
  noteId: id,
  pages: [{ id: `${id}-page`, paper: 'lines', elements }]
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
    const indexPath = join(dataDir, 'index.json')
    await page.evaluate(() => window.liftInk.loadNoteIndex())
    await writeFile(indexPath, JSON.stringify([record]), 'utf8')
    const legacyIndex = await page.evaluate(() => window.liftInk.loadNoteIndex())
    assert.equal(legacyIndex.value[0].title, record.title)
    assert.equal(legacyIndex.recovered, false)
    await page.evaluate((notes) => window.liftInk.saveNoteIndex(notes), [record])
    await page.evaluate(
      (notes) => window.liftInk.saveNoteIndex(notes),
      [{ ...record, summary: '第二版' }]
    )
    const indexFile = JSON.parse(await readFile(indexPath, 'utf8'))
    assert.equal(indexFile.version, 1)
    assert.equal(indexFile.notes[0].summary, '第二版')
    await writeFile(indexPath, '{broken index', 'utf8')
    const indexRecovery = await page.evaluate(() => window.liftInk.loadNoteIndex())
    assert.equal(indexRecovery.recovered, true)
    assert.equal(indexRecovery.value[0].summary, '第一版')
    assert((await readdir(dataDir)).some((name) => name.startsWith('index.json.corrupt-')))

    const first = makeDocument(noteId)
    const second = makeDocument(noteId, [
      {
        kind: 'ink',
        id: 'stroke-1',
        color: '#433654',
        width: 4,
        points: [
          { x: 20, y: 30, pressure: 0.5 },
          { x: 40, y: 50, pressure: 0.7 }
        ]
      }
    ])
    await page.evaluate((document) => window.liftInk.saveDocument(document), first)
    await page.evaluate((document) => window.liftInk.saveDocument(document), second)
    const documentPath = join(dataDir, 'notes', `${noteId}.json`)
    await writeFile(documentPath, '{broken document', 'utf8')
    const documentRecovery = await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)
    assert.equal(documentRecovery.recovered, true)
    assert.equal(documentRecovery.value.pages[0].elements.length, 0)
    assert(
      (await readdir(join(dataDir, 'notes'))).some((name) =>
        name.startsWith(`${noteId}.json.corrupt-`)
      )
    )

    const withMissingImage = makeDocument(noteId, [
      {
        kind: 'image',
        id: 'image-1',
        assetId: missingImage,
        x: 100,
        y: 120,
        width: 200,
        height: 100
      }
    ])
    await page.evaluate((document) => window.liftInk.saveDocument(document), withMissingImage)
    const latest = await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)
    assert.equal(latest.recovered, false)
    assert.equal(latest.value.pages[0].elements[0].assetId, missingImage)

    const imageBase64 = await page.evaluate(() => {
      const sample = document.createElement('canvas')
      sample.width = 2
      sample.height = 2
      sample.getContext('2d').fillRect(0, 0, 2, 2)
      return sample.toDataURL('image/png').split(',')[1]
    })
    const storedImage = await page.evaluate(
      (base64) => window.liftInk.storeImage('image/png', base64),
      imageBase64
    )
    const imagePath = join(dataDir, 'assets', storedImage.assetId)
    const originalImage = await readFile(imagePath)
    await page.evaluate((base64) => window.liftInk.storeImage('image/png', base64), imageBase64)
    assert((await readFile(imagePath)).equals(originalImage))
    await writeFile(imagePath, 'damaged image')
    await assert.rejects(
      page.evaluate((id) => window.liftInk.loadImage(id), storedImage.assetId),
      /图片资源内容损坏/
    )
    await page.evaluate((base64) => window.liftInk.storeImage('image/png', base64), imageBase64)
    assert((await readFile(imagePath)).equals(originalImage))
    assert(
      (await readdir(join(dataDir, 'assets'))).some((name) =>
        name.startsWith(`${storedImage.assetId}.corrupt-`)
      )
    )

    const failedId = 'unrecoverable-note'
    const failedPath = join(dataDir, 'notes', `${failedId}.json`)
    await page.evaluate((document) => window.liftInk.saveDocument(document), makeDocument(failedId))
    await writeFile(failedPath, '{unrecoverable', 'utf8')
    await assert.rejects(
      page.evaluate((id) => window.liftInk.loadDocument(id), failedId),
      /没有有效备份/
    )
    await assert.rejects(
      page.evaluate((document) => window.liftInk.saveDocument(document), makeDocument(failedId)),
      /阻止覆盖/
    )
    assert.equal(await readFile(failedPath, 'utf8'), '{unrecoverable')

    const blockedId = 'failed-write-note'
    const blockedPath = join(dataDir, 'notes', `${blockedId}.json`)
    await page.evaluate(
      (document) => window.liftInk.saveDocument(document),
      makeDocument(blockedId)
    )
    await mkdir(`${blockedPath}.bak`)
    await assert.rejects(
      page.evaluate(
        (document) => window.liftInk.saveDocument(document),
        makeDocument(blockedId, [
          {
            kind: 'ink',
            id: 'blocked-stroke',
            color: '#433654',
            width: 4,
            points: [{ x: 1, y: 2, pressure: 0.5 }]
          }
        ])
      )
    )
    assert.equal(JSON.parse(await readFile(blockedPath, 'utf8')).pages[0].elements.length, 0)
    await writeFile(failedPath, JSON.stringify(makeDocument(failedId)), 'utf8')
    await page.evaluate((document) => window.liftInk.saveDocument(document), makeDocument(failedId))
    await rmdir(`${blockedPath}.bak`)
    await page.evaluate(
      (document) => window.liftInk.saveDocument(document),
      makeDocument(blockedId)
    )
  } finally {
    await app.close()
  }

  ;({ app, page } = await launch())
  try {
    await page.getByText('恢复测试笔记').first().click()
    await page.getByRole('region', { name: '笔记页面' }).waitFor()
    await page.getByText('1 张图片资源缺失').waitFor()
    await page.getByLabel('图片资源缺失').waitFor()
    const persisted = await page.evaluate((id) => window.liftInk.loadDocument(id), noteId)
    assert.equal(persisted.value.pages[0].elements[0].assetId, missingImage)
    console.log(
      'Storage recovery passed: index/document backup, image repair, write failure, restart, missing image'
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
  if (dirname(resolved) === tempRoot && basename(resolved).startsWith('liftink-storage-check-'))
    await rm(resolved, { recursive: true, force: true })
  else {
    process.stderr.write(`拒绝清理非测试目录：${resolved}\n`)
    process.exitCode = 1
  }
}
