import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { MAX_NOTE_PAGES, MAX_PDF_BYTES } from '../../../shared/editor'
import type { NotePage } from '../../../shared/editor'
import { indexPdfPage } from './pdfSearch'

GlobalWorkerOptions.workerSrc = worker

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export async function preparePdf(
  file: File,
  remainingPages: number,
  onProgress: (message: string) => void,
  signal?: AbortSignal
): Promise<{ sourceId: string; pages: NotePage[]; assetUrls: Record<string, string> }> {
  if (file.size > MAX_PDF_BYTES) throw new Error('单个 PDF 不能超过 120 MB')
  onProgress('正在读取 PDF…')
  const raw = new Uint8Array(await file.arrayBuffer())
  signal?.throwIfAborted()
  const task = getDocument({ data: raw.slice() })
  const destroy = (): void => { void task.destroy().catch(() => undefined) }
  signal?.addEventListener('abort', destroy, { once: true })
  try {
    const pdf = await task.promise
    if (pdf.numPages > remainingPages)
      throw new Error(`导入后笔记不能超过 ${MAX_NOTE_PAGES} 页`)

    const sourceId = await window.liftInk.storePdfSource(raw)
    const pages: NotePage[] = []
    const nativeText: string[] = []
    const assetUrls: Record<string, string> = {}
    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) throw new Error('无法创建 PDF 画布')
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted()
      onProgress(`正在导入 PDF · ${number}/${pdf.numPages}`)
      const page = await pdf.getPage(number)
      const size = page.getViewport({ scale: 1 })
      let image: Awaited<ReturnType<typeof window.liftInk.storeImage>> | undefined
      if (pdf.numPages <= 30 || number <= 2) {
        const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(size.width, size.height)) })
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await page.render({ canvas, canvasContext, viewport }).promise
        image = await window.liftInk.storeImage('image/png', canvas.toDataURL('image/png').split(',')[1])
      }
      const logicalScale = Math.min(size.width > size.height ? 980 / size.width : 750 / size.width, 1800 / size.height)
      pages.push({
        id: crypto.randomUUID(),
        paper: 'blank',
        size: { width: Math.max(1, size.width * logicalScale), height: Math.max(1, size.height * logicalScale) },
        elements: [],
        backgroundAssetId: image?.assetId,
        sourcePdfId: sourceId,
        sourcePageNumber: number
      })
      if (image) assetUrls[image.assetId] = image.dataUrl
      nativeText.push(await indexPdfPage(page).then(({ searchable }) => searchable.slice(0, 24_000)).catch(() => ''))
      page.cleanup()
    }
    signal?.throwIfAborted()
    await window.liftInk.saveNativePdfText(sourceId, nativeText).catch(() => undefined)
    return { sourceId, pages, assetUrls }
  } finally {
    signal?.removeEventListener('abort', destroy)
    if (!signal?.aborted) await task.destroy().catch(() => undefined)
  }
}
