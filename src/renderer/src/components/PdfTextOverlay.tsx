import { useEffect, useRef, useState } from 'react'
import { getDocument, TextLayer } from 'pdfjs-dist'
import type { NotePage } from '../../../shared/editor'

export default function PdfTextOverlay({ page, width, height }: { page: NotePage; width: number; height: number }): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const { sourcePdfId, sourcePageNumber } = page
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '240px' })
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const target = container.current
    if (!visible || !target || !sourcePdfId || !sourcePageNumber) return
    let disposed = false
    let task: ReturnType<typeof getDocument> | undefined
    let layer: TextLayer | undefined
    target.replaceChildren()
    void (async () => {
      const bytes = await window.liftInk.readPdfSource(sourcePdfId)
      if (disposed) return
      task = getDocument({ data: bytes })
      const pdf = await task.promise
      const source = await pdf.getPage(sourcePageNumber)
      if (disposed) return
      const natural = source.getViewport({ scale: 1 })
      const scale = Math.min(width / natural.width, height / natural.height)
      const viewport = source.getViewport({ scale })
      target.style.setProperty('--total-scale-factor', String(scale * natural.userUnit))
      target.style.left = `${(width - viewport.width) / 2}px`
      target.style.top = `${(height - viewport.height) / 2}px`
      layer = new TextLayer({ container: target, viewport, textContentSource: source.streamTextContent() })
      await layer.render()
      if (!disposed && !target.textContent?.trim()) target.setAttribute('data-empty', '扫描页可在 PDF 查找中识别并复制文字')
    })().catch(() => { if (!disposed) target.setAttribute('data-empty', '无法加载 PDF 原文') })
    return () => {
      disposed = true
      layer?.cancel()
      void task?.destroy().catch(() => undefined)
      target.removeAttribute('data-empty')
    }
  }, [sourcePdfId, sourcePageNumber, width, height, visible])
  return <div ref={host} className="pdf-text-overlay"><div ref={container} className="pdf-selectable-text" aria-label="可选中的 PDF 原文" /></div>
}
