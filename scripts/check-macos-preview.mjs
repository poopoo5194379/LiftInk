import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

assert.equal(process.platform, 'darwin')
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
assert(executablePath, 'Use the packaged Mac executable')
const root = await mkdtemp(join(tmpdir(), 'liftink-macos-preview-'))
const app = await electron.launch({ executablePath, env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })

try {
  const page = await app.firstWindow()
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
  const diagnostics = await page.evaluate(() => window.liftInk.appDiagnostics())
  assert.equal(diagnostics.platform, 'darwin')
  assert.equal(diagnostics.arch, process.arch)
  await page.keyboard.press('Meta+k')
  await expect(page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' })).toBeFocused()
  await page.keyboard.press('Escape')

  const pdf = await PDFDocument.create()
  pdf.addPage()
  const sourcePath = join(root, 'Mac PDF sample.pdf')
  await writeFile(sourcePath, await pdf.save())
  await app.evaluate(({ app }, path) => {
    app.emit('open-file', new Event('open-file', { cancelable: true }), path)
  }, sourcePath)
  await expect(page.getByLabel('笔记标题')).toHaveValue('Mac PDF sample')
  await expect(page.getByRole('img', { name: '笔记画布' }).first()).toBeVisible()
  await page.keyboard.press('Meta+s')

  const window = await app.browserWindow(page)
  await Promise.all([page.waitForEvent('close'), window.evaluate((window) => window.close())])
  const [reopened] = await Promise.all([
    app.waitForEvent('window'),
    app.evaluate(({ app }) => { app.emit('activate', {}, false) })
  ])
  await expect(reopened.getByRole('button', { name: /Mac PDF sample/ }).first()).toBeVisible()
  console.log('macOS preview passed: packaged launch, Command shortcuts, PDF open event, save and window reopen')
} finally {
  await app.close()
  await rm(root, { recursive: true, force: true })
}
