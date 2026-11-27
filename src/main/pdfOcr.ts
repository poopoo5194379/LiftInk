import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { MAX_NOTE_PAGES, type PdfOcrPage } from '../shared/editor'
import { replaceAtomic } from './storage'

let worker: Promise<Worker> | undefined
let queue: Promise<unknown> = Promise.resolve()
const languages = ['chi_sim', 'eng']
const validPdfId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{64}\.pdf$/.test(id)

export async function loadNativePdfText(root: string, id: unknown): Promise<string[] | null> {
  if (!validPdfId(id)) throw new Error('PDF 来源无效')
  try {
    const pages: unknown = JSON.parse(await readFile(join(root, 'pdf-text-v1', `${id}.json`), 'utf8'))
    return Array.isArray(pages) && pages.length <= MAX_NOTE_PAGES && pages.every((page) => typeof page === 'string' && page.length <= 24_000) ? pages : null
  } catch { return null }
}

export async function saveNativePdfText(root: string, id: unknown, pages: unknown): Promise<void> {
  if (!validPdfId(id) || !Array.isArray(pages) || !pages.length || pages.length > MAX_NOTE_PAGES ||
      !pages.every((page) => typeof page === 'string' && page.length <= 24_000)) throw new Error('PDF 索引数据无效')
  await replaceAtomic(join(root, 'pdf-text-v1', `${id}.json`), JSON.stringify(pages))
}

function cachePath(root: string, id: unknown, page: unknown): string {
  if (!validPdfId(id) ||
      typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > MAX_NOTE_PAGES) {
    throw new Error('PDF 识别请求无效')
  }
  return join(root, 'ocr-v1', id.slice(0, 64), `${page}.json`)
}

export async function loadPdfOcr(root: string, id: unknown, page: unknown): Promise<PdfOcrPage | null> {
  const path = cachePath(root, id, page)
  try { return JSON.parse(await readFile(path, 'utf8')) as PdfOcrPage }
  catch { return null }
}

export async function savePdfOcr(root: string, id: unknown, page: unknown, value: unknown): Promise<void> {
  const path = cachePath(root, id, page)
  const result = value as PdfOcrPage | undefined
  if (!result || !Number.isInteger(result.width) || !Number.isInteger(result.height) ||
      result.width < 1 || result.height < 1 || result.width * result.height > 8_000_000 ||
      typeof result.text !== 'string' || result.text.length > 120_000 ||
      !Array.isArray(result.words) || result.words.length > 30_000 ||
      !result.words.every((word) => word && typeof word.text === 'string' && word.text.length <= 1000 &&
        [word.x0, word.x1, word.y0, word.y1].every(Number.isFinite) && word.x0 >= 0 && word.y0 >= 0 &&
        word.x0 <= word.x1 && word.y0 <= word.y1 && word.x1 <= result.width && word.y1 <= result.height)) {
    throw new Error('OCR 索引数据无效')
  }
  if (!(await loadPdfOcr(root, id, page))?.text) await replaceAtomic(path, JSON.stringify(result))
}

async function openWorker(root: string): Promise<Worker> {
  const langPath = join(root, 'ocr-v1', 'languages')
  await mkdir(langPath, { recursive: true })
  await Promise.all(languages.map(async (code) => {
    const packagePath = require.resolve(`@tesseract.js-data/${code}/package.json`)
    const filename = `${code}.traineddata.gz`
    const data = await readFile(join(dirname(packagePath), '4.0.0_best_int', filename))
    await replaceAtomic(join(langPath, filename), data)
  }))
  return new Promise((resolve, reject) => {
    void createWorker(languages, OEM.LSTM_ONLY, { langPath, cacheMethod: 'none', errorHandler: reject }).then(resolve, reject)
  })
}

export function recognizePdfPage(
  root: string, id: unknown, page: unknown, png: unknown, width: unknown, height: unknown, refresh: unknown
): Promise<PdfOcrPage> {
  const path = cachePath(root, id, page)
  if (typeof png !== 'string' || !png.length || png.length > 24_000_000 ||
      typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width * height > 8_000_000) {
    throw new Error('PDF 识别图像无效')
  }
  const work = queue.catch(() => undefined).then(async () => {
    const cached = await loadPdfOcr(root, id, page)
    if (cached && refresh !== true) return cached
    worker ??= openWorker(root).catch((error: unknown) => { worker = undefined; throw error })
    const engine = await worker
    const image = Buffer.from(png, 'base64')
    const output = { text: true, blocks: true }
    await engine.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    let { data } = await engine.recognize(image, {}, output)
    if (data.text.replace(/\s/g, '').length < 12) {
      await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
      const sparse = await engine.recognize(image, {}, output)
      if (sparse.data.text.replace(/\s/g, '').length > data.text.replace(/\s/g, '').length) data = sparse.data
    }
    const words = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.flatMap((line) => line.words.map(({ text, bbox }) => ({ text, ...bbox })))
    )).slice(0, 30_000)
    const result = { width, height, text: data.text.slice(0, 120_000), words }
    if (result.text.trim()) {
      await replaceAtomic(path, JSON.stringify(result))
    }
    return result.text.trim() ? result : cached ?? result
  })
  queue = work
  return work
}

export function recognizeInk(root: string, png: unknown): Promise<string> {
  if (typeof png !== 'string' || !png.length || png.length > 16_000_000) throw new Error('手写识别图像无效')
  const image = Buffer.from(png, 'base64')
  if (!image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      image.length < 24 || image.readUInt32BE(16) * image.readUInt32BE(20) > 16_000_000) throw new Error('手写识别图像无效')
  const work = queue.catch(() => undefined).then(async () => {
    worker ??= openWorker(root).catch((error: unknown) => { worker = undefined; throw error })
    const engine = await worker
    await engine.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const { data } = await engine.recognize(image)
    return data.text.trim().slice(0, 24_000)
  })
  queue = work
  return work
}
