import { getDocument, type PDFPageProxy } from 'pdfjs-dist'

const sources = new Map<string, { task: Promise<ReturnType<typeof getDocument>>; count: number; idle?: number }>()

export async function withPdfPage<T>(id: string, number: number, use: (page: PDFPageProxy) => Promise<T>): Promise<T> {
  let source = sources.get(id)
  if (!source) {
    source = { task: window.liftInk.readPdfSource(id).then((data) => getDocument({ data })), count: 0 }
    sources.set(id, source)
  }
  window.clearTimeout(source.idle)
  source.count++
  try {
    const task = await source.task
    return await use(await (await task.promise).getPage(number))
  } finally {
    source.count--
    if (!source.count) source.idle = window.setTimeout(() => {
      sources.delete(id)
      void source.task.then((task) => task.destroy()).catch(() => undefined)
    }, 2500)
  }
}

export async function pdfPageImage(id: string, number: number): Promise<string> {
  return withPdfPage(id, number, async (page) => {
    const natural = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(2, 1700 / Math.max(natural.width, natural.height)) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL('image/png')
  })
}
