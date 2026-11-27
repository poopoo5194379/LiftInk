import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const parent = await realpath(tmpdir())
const root = await mkdtemp(join(parent, 'liftink-trash-drop-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: join(root, 'library') }
const source = join(root, '资源管理器拖入.pdf')
const appendix = join(root, 'Appendix.pdf')
const originalPages = process.argv[2] ? Number(process.argv[3]) : 2
const title = '资源管理器拖入'
let app

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function makePdf(path, count) {
  const pdf = await PDFDocument.create()
  for (let i = 1; i <= count; i++) {
    pdf.addPage([420, 560]).drawText(`LiftInk PDF drop fixture page ${i}`, { x: 35, y: 510 })
  }
  await writeFile(path, await pdf.save())
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function dropFile(page, target, path, home = false) {
  const box = await target.boundingBox()
  assert(box)
  const session = await page.context().newCDPSession(page)
  const event = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + Math.min(180, box.height / 2)),
    data: { items: [], files: [path], dragOperationsMask: 1 }
  }
  try {
    await session.send('Input.dispatchDragEvent', { type: 'dragEnter', ...event })
    await session.send('Input.dispatchDragEvent', { type: 'dragOver', ...event })
    if (home) await page.getByText('松开以导入 PDF 或图片', { exact: true }).waitFor()
    await session.send('Input.dispatchDragEvent', { type: 'drop', ...event })
  } finally {
    await session.detach()
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function launch() {
  app = await electron.launch({ args: ['.'], env })
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.locator('.new-note').waitFor()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: /^文件与备份/ }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) =>
    button.textContent.trim() === '导出 .liftink' && !button.disabled
  ))
  await page.getByRole('button', { name: '返回首页', exact: true }).click()
  return page
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function trash(page) {
  await page.locator('.note-tile').filter({ hasText: title }).hover()
  await page.getByRole('button', { name: `${title} 更多操作` }).click()
  await page.getByRole('button', { name: '移入回收站', exact: true }).click()
  await page.locator('.note-card').filter({ hasText: title }).waitFor({ state: 'hidden' })
}

try {
  assert(Number.isInteger(originalPages) && originalPages > 0)
  if (process.argv[2]) await copyFile(resolve(process.argv[2]), source)
  else await makePdf(source, originalPages)
  await makePdf(appendix, 1)
  let page = await launch()
  const invalid = join(root, 'invalid.pdf')
  await writeFile(invalid, 'This is not a PDF.')
  await dropFile(page, page.locator('.workspace'), invalid, true)
  await page.getByText(/已导入 0 个，1 个失败/).waitFor()
  assert.equal(await page.getByLabel('笔记标题').count(), 0)
  assert.equal(await page.locator('.note-card').filter({ hasText: 'invalid' }).count(), 0)
  await dropFile(page, page.locator('.workspace'), source, true)
  await page.getByLabel('笔记画布').nth(originalPages - 1).waitFor({ timeout: 240_000 })
  assert.equal(await page.getByLabel('笔记标题').inputValue(), title)
  console.log(`Home file drop created a ${originalPages}-page note.`)
  const id = await page.evaluate(async (title) =>
    (await window.liftInk.loadNoteIndex()).value?.find((note) => note.title === title)?.id, title
  )
  assert(id)
  const initial = (await page.evaluate((id) => window.liftInk.loadDocument(id), id)).value
  assert.equal(initial.pages.length, originalPages)
  assert(initial.pages.every((entry, index) => entry.sourcePageNumber === index + 1))
  await page.getByRole('button', { name: '笔记位置' }).click()
  await page.getByRole('option', { name: '课程笔记', exact: true }).click()
  const first = page.getByLabel('笔记画布').first()
  const box = await first.boundingBox()
  assert(box)
  await page.mouse.move(box.x + 185, box.y + 130)
  await page.mouse.down()
  await page.mouse.move(box.x + 240, box.y + 155, { steps: 5 })
  await page.mouse.up()
  assert.equal(await first.locator('path').count(), 1)

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 12
    const context = canvas.getContext('2d')
    context.fillStyle = '#9877ee'
    context.fillRect(0, 0, 12, 12)
    return canvas.toDataURL().split(',')[1]
  })
  await page.locator('input[type=file][accept*="image/png"]').setInputFiles({
    name: 'attachment.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64')
  })
  await first.locator('image').waitFor()
  await dropFile(page, page.locator('.editor-canvas'), appendix)
  await page.getByLabel('笔记画布').nth(originalPages).waitFor()
  const edited = (await page.evaluate((id) => window.liftInk.loadDocument(id), id)).value
  assert.equal(edited.pages.length, originalPages + 1)
  assert.deepEqual(edited.pages.slice(0, originalPages).map(({ id }) => id), initial.pages.map(({ id }) => id))
  assert.notEqual(edited.pages.at(-1).sourcePdfId, edited.pages[0].sourcePdfId)
  assert(edited.pages[0].elements.some((element) => element.kind === 'ink'))
  assert(edited.pages[0].elements.some((element) => element.kind === 'image'))
  console.log('Editor file drop appended a separate PDF and preserved ink and image attachments.')

  await page.getByRole('button', { name: '返回上一页' }).click()
  await trash(page)
  await page.getByRole('button', { name: '撤销移入回收站' }).click()
  await page.locator('.note-card').filter({ hasText: title }).waitFor()
  await trash(page)
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await page.getByRole('button', { name: `还原 ${title}` }).waitFor()
  await app.close()
  await rename(source, join(root, 'moved-source.pdf'))
  await rename(appendix, join(root, 'moved-appendix.pdf'))

  page = await launch()
  assert.equal(await page.locator('.note-card').filter({ hasText: title }).count(), 0)
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await page.getByText('原位置 · 课程笔记', { exact: true }).waitFor()
  await page.getByRole('button', { name: `还原 ${title}` }).click()
  await page.getByText('回收站为空', { exact: true }).waitFor()
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await page.getByRole('button', { name: '课程笔记', exact: true }).click()
  await page.locator('.recent-file-row').filter({ hasText: title }).click()
  await page.locator('.editor-paper').first().locator('img[alt="PDF 原页"]').waitFor()
  await page.getByLabel('笔记画布').first().locator('image').waitFor()
  const reopened = (await page.evaluate((id) => window.liftInk.loadDocument(id), id)).value
  assert.deepEqual(reopened.pages, edited.pages)
  const resources = await page.evaluate(async (ids) =>
    Promise.all(ids.map(async (id) => (await window.liftInk.loadMedia(id)).dataUrl.startsWith('data:application/pdf'))),
  edited.sourcePdfIds)
  assert(resources.every(Boolean))
  const record = await page.evaluate(async (id) =>
    (await window.liftInk.loadNoteIndex()).value.find((entry) => entry.id === id), id
  )
  assert.equal(record.trashed, false)
  assert.equal(record.folder, '课程笔记')
  console.log('Immediate undo, restart, and trash restore passed after both external PDFs were moved.')

  const executablePath = process.env['LIFTINK_TEST_PACKAGED_EXE']
  if (executablePath) {
    await app.close()
    app = await electron.launch({
      executablePath,
      args: ['--open-pdf', join(root, 'moved-appendix.pdf')],
      env
    })
    page = await app.firstWindow()
    await page.getByLabel('笔记标题').waitFor()
    assert.equal(await page.getByLabel('笔记标题').inputValue(), 'moved-appendix')
    await page.getByLabel('笔记画布').first().waitFor()

    const anotherPdf = join(root, '已运行时打开.pdf')
    await makePdf(anotherPdf, 1)
    await app.evaluate(({ app }) => {
      app.once('second-instance', (_event, _args, _cwd, data) => { globalThis.liftinkTestOpenData = data })
    })
    const child = spawn(executablePath, ['--open-pdf', anotherPdf], {
      env, stdio: 'ignore', windowsHide: true
    })
    try {
      const [code] = await once(child, 'exit', { signal: AbortSignal.timeout(15_000) })
      assert.equal(code, 0)
    } finally {
      if (child.exitCode === null) child.kill()
    }
    assert.equal(await app.evaluate(() => globalThis.liftinkTestOpenData?.pdfPath), anotherPdf)
    await page.waitForFunction(() =>
      document.querySelector('input[aria-label="笔记标题"]')?.value === '已运行时打开'
    )
    assert.equal(app.windows().length, 1)
    console.log('Packaged Open with command passed on cold start and an already running app.')
  }
} finally {
  if (app) await app.close()
  const target = await realpath(root)
  if (dirname(target) === parent && basename(target).startsWith('liftink-trash-drop-')) {
    await rm(target, { recursive: true, force: true })
  }
}
