import { getDocument, Util } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { NotePage, PageSize, PdfOcrPage } from '../../../shared/editor'
import { pageSize } from './paper'

export type PdfMark = { x: number; y: number; width: number; height: number; angle: number }
type TextRun = { start: number; end: number; mark: PdfMark; rtl: boolean }
type TextGap = { at: number; length: number }
export type IndexedPage = { text: string; searchable: string; gaps: TextGap[]; runs: TextRun[]; size: PageSize }
export type PdfTextIndex = Map<string, IndexedPage[]>
export type PdfHit = {
  pageId: string
  pageNumber: number
  offset: number
  excerpt: string
  marks: PdfMark[]
}

const hanGaps = /(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu
const fold = (text: string): string => text.replace(/./gu, (char) => {
  const lower = char.toLowerCase()
  return lower.length === char.length ? lower : char
})

export function normalizePdfText(text: string): string {
  return fold(text.normalize('NFKC').replace(/\s+/g, ' ').trim()).replace(hanGaps, '')
}

function finishIndex(text: string, runs: TextRun[], size: PageSize): IndexedPage {
  let removed = 0
  const gaps = Array.from(text.matchAll(hanGaps), (match) => {
    const gap = { at: match.index - removed, length: match[0].length }
    removed += gap.length
    return gap
  })
  return { text, searchable: fold(text).replace(hanGaps, ''), gaps, runs, size }
}

export async function indexPdfPage(page: PDFPageProxy): Promise<IndexedPage> {
  const viewport = page.getViewport({ scale: 1 })
  const { items, styles } = await page.getTextContent()
  let text = ''
  const runs: TextRun[] = []
  for (const item of items) {
    if (!('str' in item)) continue
    const value = item.str.normalize('NFKC').replace(/\s+/g, ' ')
    if (value) {
      const transform = Util.transform(viewport.transform, item.transform)
      const style = styles[item.fontName]
      const angle = Math.atan2(transform[1], transform[0]) + (style?.vertical ? Math.PI / 2 : 0)
      const height = Math.hypot(transform[2], transform[3])
      const ascent = height * (style?.ascent || (style?.descent ? 1 + style.descent : 0.8))
      const mark = {
        x: transform[4] + ascent * Math.sin(angle),
        y: transform[5] - ascent * Math.cos(angle),
        width: style?.vertical ? item.height : item.width,
        height,
        angle
      }
      runs.push({ start: text.length, end: text.length + value.length, mark, rtl: item.dir === 'rtl' })
      text += value
    }
    if (item.hasEOL && text && !text.endsWith(' ')) text += ' '
  }
  return finishIndex(text, runs, { width: viewport.width, height: viewport.height })
}

export async function indexPdf(sourceId: string, signal: AbortSignal): Promise<IndexedPage[]> {
  const data = await window.liftInk.readPdfSource(sourceId)
  signal.throwIfAborted()
  const task = getDocument({ data })
  const destroy = (): void => { void task.destroy().catch(() => undefined) }
  signal.addEventListener('abort', destroy, { once: true })
  try {
    const pdf = await task.promise
    const pages: IndexedPage[] = []
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted()
      const page = await pdf.getPage(number)
      try {
        pages.push(await indexPdfPage(page))
      } finally {
        page.cleanup()
      }
    }
    return pages
  } finally {
    signal.removeEventListener('abort', destroy)
    if (!signal.aborted) await task.destroy()
  }
}

export function getIndexedPage(index: PdfTextIndex, page: NotePage): IndexedPage | undefined {
  if (!page.sourcePdfId || !page.sourcePageNumber) return undefined
  return index.get(page.sourcePdfId)?.[page.sourcePageNumber - 1]
}

export function indexOcrText(result: PdfOcrPage): IndexedPage {
  let text = ''
  const runs: TextRun[] = []
  const han = /\p{Script=Han}/u
  for (const word of result.words) {
    const value = word.text.normalize('NFKC').trim()
    if (!value) continue
    if (text && !(han.test(text.at(-1)!) && han.test(value[0]))) text += ' '
    runs.push({ start: text.length, end: text.length + value.length, rtl: false, mark: {
      x: word.x0, y: word.y0, width: word.x1 - word.x0, height: word.y1 - word.y0, angle: 0
    } })
    text += value
  }
  if (!text) text = result.text.normalize('NFKC').trim().replace(/\s+/g, ' ')
  return finishIndex(text, runs, { width: result.width, height: result.height })
}

export async function recognizePdfPages(
  pages: NotePage[],
  signal: AbortSignal,
  onResult: (pageId: string, result: PdfOcrPage) => void,
  onProgress: (current: number, failed: number) => void,
  refresh = false
): Promise<number> {
  const sources = new Map<string, NotePage[]>()
  for (const page of pages) {
    if (page.sourcePdfId && page.sourcePageNumber) {
      const entries = sources.get(page.sourcePdfId) ?? []
      entries.push(page)
      sources.set(page.sourcePdfId, entries)
    }
  }
  let done = 0
  let failed = 0
  for (const [id, entries] of sources) {
    signal.throwIfAborted()
    let task: ReturnType<typeof getDocument> | undefined
    try {
      const media = await window.liftInk.loadMedia(id)
      signal.throwIfAborted()
      const binary = atob(media.dataUrl.split(',')[1])
      task = getDocument({ data: Uint8Array.from(binary, (char) => char.charCodeAt(0)) })
      const pdf = await task.promise
      for (const entry of entries) {
        signal.throwIfAborted()
        const number = entry.sourcePageNumber!
        try {
          let result = refresh ? null : await window.liftInk.loadPdfOcr(id, number)
          if (!result) {
            const page = await pdf.getPage(number)
            try {
              const size = page.getViewport({ scale: 1 })
              const viewport = page.getViewport({ scale: Math.min(4, 2800 / Math.max(size.width, size.height)) })
              const canvas = document.createElement('canvas')
              canvas.width = Math.round(viewport.width)
              canvas.height = Math.round(viewport.height)
              await page.render({ canvas, viewport, canvasContext: canvas.getContext('2d')! }).promise
              signal.throwIfAborted()
              result = await window.liftInk.recognizePdfPage(id, number, canvas.toDataURL('image/png').split(',')[1], canvas.width, canvas.height, refresh)
            } finally { page.cleanup() }
          }
          if (!signal.aborted) onResult(entry.id, result)
        } catch {
          if (signal.aborted) signal.throwIfAborted()
          failed++
        }
        onProgress(++done, failed)
      }
    } catch {
      signal.throwIfAborted()
      failed += entries.length
      done += entries.length
      onProgress(done, failed)
    } finally { await task?.destroy().catch(() => undefined) }
  }
  return failed
}

export function findPdfText(
  index: PdfTextIndex,
  pages: NotePage[],
  query: string,
  ocr?: Map<string, IndexedPage>
): { hits: PdfHit[]; total: number } {
  const term = normalizePdfText(query)
  const hits: PdfHit[] = []
  let total = 0
  if (!term) return { hits, total }
  for (const [pageIndex, notePage] of pages.entries()) {
    const native = getIndexedPage(index, notePage)
    const scan = ocr?.get(notePage.id)
    const entries = [native]
    if (scan && !native?.searchable.includes(scan.searchable)) entries.push(scan)
    let sectionOffset = 0
    const paper = pageSize(notePage)
    for (const page of entries) {
      if (!page) continue
      const scale = Math.min(paper.width / page.size.width, paper.height / page.size.height)
      const offsetX = (paper.width - page.size.width * scale) / 2
      const offsetY = (paper.height - page.size.height * scale) / 2
      let offset = page.searchable.indexOf(term)
      while (offset !== -1) {
        const end = offset + term.length
        total++
        if (hits.length < 200) {
          let sourceFrom = offset, sourceTo = end
          for (const gap of page.gaps) {
            if (gap.at >= end) break
            if (gap.at <= offset) sourceFrom += gap.length
            sourceTo += gap.length
          }
          const marks: PdfMark[] = []
          for (const run of page.runs) {
            if (run.end <= sourceFrom) continue
            if (run.start >= sourceTo) break
            const { mark } = run
            const from = (Math.max(sourceFrom, run.start) - run.start) / (run.end - run.start)
            const to = (Math.min(sourceTo, run.end) - run.start) / (run.end - run.start)
            const shift = (run.rtl ? 1 - to : from) * mark.width
            if (mark.width > 0 && mark.height > 0) {
              marks.push({
                x: offsetX + (mark.x + Math.cos(mark.angle) * shift) * scale,
                y: offsetY + (mark.y + Math.sin(mark.angle) * shift) * scale,
                width: (to - from) * mark.width * scale,
                height: mark.height * scale,
                angle: mark.angle
              })
            }
          }
          hits.push({
            pageId: notePage.id,
            pageNumber: pageIndex + 1,
            offset: sectionOffset + offset,
            excerpt: [
              sourceFrom > 20 ? '…' : '',
              page.text.slice(Math.max(0, sourceFrom - 20), Math.min(page.text.length, sourceTo + 30)),
              sourceTo + 30 < page.text.length ? '…' : ''
            ].join(''),
            marks
          })
        }
        offset = page.searchable.indexOf(term, end)
      }
      sectionOffset += page.searchable.length + 1
    }
  }
  return { hits, total }
}
