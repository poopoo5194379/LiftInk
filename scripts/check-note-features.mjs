import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { _electron as electron, expect } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const parent = await realpath(tmpdir())
const root = await mkdtemp(join(parent, 'liftink-note-features-'))
const env = { ...process.env, LIFTINK_TEST_DATA_DIR: root }
const executablePath = process.env.LIFTINK_TEST_PACKAGED_EXE
const speechLanguage = process.env.LIFTINK_TEST_AUDIO_LANGUAGE === 'zh' ? 'zh' : 'en'
const expectedSpeech = speechLanguage === 'zh' ? /笔记|你好/ : /orchid|local recording/i
const args = executablePath ? [] : ['.']
if (env.LIFTINK_TEST_AUDIO) args.push('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${resolve(env.LIFTINK_TEST_AUDIO)}%noloop`)
const launch = () => electron.launch({ executablePath, args, env })
const exportPath = join(root, 'editor-check.md')
let app

try {
  app = await launch()
  app.process().stderr?.on('data', (data) => {
    const message = data.toString().trim()
    if (/Error|Tesseract/i.test(message)) console.error(message.slice(0, 1000))
  })
  let page = await app.firstWindow()
  page.on('pageerror', (error) => console.error(error))
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  await page.getByRole('button', { name: '查看全部日程' }).click()
  await page.getByRole('button', { name: '新增日程', exact: true }).click()
  await page.getByPlaceholder('输入日程内容').fill('项目周会')
  await page.getByRole('button', { name: '添加日程', exact: true }).click()
  await page.getByRole('button', { name: '周视图', exact: true }).click()
  await expect(page.locator('.agenda-range-day')).toHaveCount(7)
  await page.getByRole('button', { name: '月视图', exact: true }).click()
  await expect(page.locator('.agenda-month-grid > strong')).toHaveCount(7)
  await expect(page.locator('.agenda-month-grid').getByText('项目周会')).toBeVisible()
  await page.getByRole('button', { name: '返回首页' }).click()
  console.log('Agenda week and calendar month passed.')

  await page.getByRole('button', { name: '新建 Markdown', exact: true }).click()
  await page.getByLabel('笔记标题').fill('Markdown fixture')
  let body = page.getByRole('textbox', { name: 'Markdown 正文' })
  await expect(body).toHaveAttribute('contenteditable', 'true')
  await body.pressSequentially('LiftInk ')
  await page.getByRole('button', { name: '加粗', exact: true }).click()
  await page.getByRole('button', { name: '文字颜色', exact: true }).click()
  await page.getByRole('button', { name: '紫色', exact: true }).click()
  await page.keyboard.insertText('格式测试')
  await expect(body.locator('strong')).toContainText('格式测试')
  await expect(body.locator('[style*="color"]')).toContainText('格式测试')
  await page.keyboard.press('Control+s')
  await expect(page.getByRole('status')).toContainText('已保存')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, exportPath)
  await page.getByRole('button', { name: '导出 Markdown' }).click()
  await expect(page.getByRole('status')).toContainText('已导出 Markdown')
  const md = await readFile(exportPath, 'utf8')
  assert.match(md, /\*\*/)
  assert.match(md, /<span style="color:#7351a7">/)
  assert.match(md, /格式测试/)
  await page.getByRole('button', { name: '返回上一页' }).click()
  console.log('Markdown toolbar, save and export passed.')

  const scan = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 1200
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#111'
    ctx.font = 'bold 58px Arial'
    ctx.fillText('LOCAL SCAN ORCHID 2026', 80, 200)
    ctx.font = '56px Microsoft YaHei'
    ctx.fillText('扫描笔记与离线搜索', 80, 310)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const pdf = await PDFDocument.create()
  const image = await pdf.embedPng(Buffer.from(scan, 'base64'))
  pdf.addPage([500, 600]).drawImage(image, { x: 0, y: 0, width: 500, height: 600 })
  const pdfPath = join(root, 'image-only-fixture.pdf')
  await writeFile(pdfPath, await pdf.save())
  await page.getByRole('button', { name: '新建笔记' }).click()
  await page.getByLabel('笔记标题').fill('OCR scan fixture')
  await page.locator('input[type=file][accept*="application/pdf"]').setInputFiles(pdfPath)
  await expect(page.getByLabel('笔记画布')).toHaveCount(1)
  await page.keyboard.press('Control+f')
  await page.getByRole('button', { name: /OCR 识别扫描页/ }).click({ timeout: 30_000 })
  await expect(page.locator('.editor-ocr-actions [role=status]')).toContainText('1 页识别出文字', { timeout: 60_000 })
  let search = page.getByRole('searchbox', { name: '搜索 PDF 原文' })
  await search.fill('ORCHID')
  let result = page.locator('.editor-pdf-search-results button').first()
  await result.click({ timeout: 90_000 })
  await expect(page.locator('.editor-pdf-search-mark').first()).toBeVisible()
  const [sourceId] = (await readdir(join(root, 'assets'))).filter((id) => id.endsWith('.pdf'))
  const ocr = await page.evaluate((id) => window.liftInk.loadPdfOcr(id, 1), sourceId)
  console.log('Scanned fixture text:', ocr?.text.trim())
  await search.fill('笔记与离线')
  await expect(result).toContainText('笔记与离线')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '返回上一页' }).click()
  console.log('Image-only PDF OCR, Chinese/English search and highlight passed.')
  const homeSearch = page.getByRole('textbox', { name: '搜索笔记、PDF、关键词' })
  await homeSearch.fill('ORCHID')
  await expect(page.getByRole('option', { name: /OCR scan fixture.*PDF 正文/ })).toBeVisible()
  await homeSearch.press('Escape')
  await homeSearch.fill('')
  await expect(page.locator('.word-cloud').getByRole('button', { name: 'orchid', exact: true })).toBeVisible()

  if (env.LIFTINK_TEST_AUDIO) {
    await page.getByRole('button', { name: '语音速记', exact: true }).click()
    await page.getByLabel('内容标题').fill('Audio transcript fixture')
    await page.getByRole('button', { name: '开始录音' }).click()
    const stop = page.getByRole('button', { name: '停止录音' })
    await stop.waitFor()
    await new Promise((resolve) => setTimeout(resolve, 7600))
    await stop.click()
    await expect(page.locator('audio')).toBeVisible()
    await page.getByLabel('转写语言').selectOption(speechLanguage)
    await page.getByRole('button', { name: '录音转文字' }).click()
    const transcriptionStatus = page.getByText(/转写失败|转写完成|没有识别出语音/)
    await transcriptionStatus.waitFor({ timeout: 150_000 })
    assert.equal(await transcriptionStatus.innerText(), '转写完成')
    const transcript = page.getByLabel('速记文字')
    await expect(transcript).toHaveValue(expectedSpeech)
    const text = await transcript.inputValue()
    await page.locator('.audio-transcription-segment').first().click()
    await page.getByRole('button', { name: '保存到未分类' }).click()
    await page.getByRole('region', { name: '最近文件列表' }).getByText('Audio transcript fixture', { exact: true }).waitFor()
    console.log(`Recorded audio and transcribed: ${text}`)
  }

  await app.close()
  app = await launch()
  page = await app.firstWindow()
  const openRecent = async (title) => {
    await page.getByRole('button', { name: '查看全部', exact: true }).click()
    await page.getByRole('button', { name: new RegExp(title) }).first().click()
  }
  await openRecent('Markdown fixture')
  body = page.getByRole('textbox', { name: 'Markdown 正文' })
  await expect(body.locator('strong')).toContainText('格式测试')
  await expect(body.locator('[style*="color"]')).toContainText('格式测试')
  await page.getByRole('button', { name: '返回上一页' }).click()
  await page.getByRole('button', { name: '首页', exact: true }).click()
  await openRecent('OCR scan fixture')
  await page.keyboard.press('Control+f')
  search = page.getByRole('searchbox', { name: '搜索 PDF 原文' })
  await search.fill('ORCHID')
  result = page.locator('.editor-pdf-search-results button').first()
  await expect(result).toContainText('ORCHID')
  if (env.LIFTINK_TEST_AUDIO) {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '返回上一页' }).click()
    await page.getByRole('button', { name: '首页', exact: true }).click()
    await openRecent('Audio transcript fixture')
    await expect(page.locator('audio')).toBeVisible()
    await expect(page.getByLabel('速记文字')).toHaveValue(expectedSpeech)
    await expect(page.locator('.audio-transcription-segment').first()).toBeVisible()
  }
  console.log('New note formats and OCR cache verified after restart.')
} finally {
  if (app) await app.close()
  const target = await realpath(root)
  if (dirname(target) === parent && basename(target).startsWith('liftink-note-features-')) {
    await rm(target, { recursive: true, force: true })
  }
}
