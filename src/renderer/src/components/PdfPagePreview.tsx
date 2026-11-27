import { useEffect, useRef, useState } from 'react'
import type { RenderTask } from 'pdfjs-dist'
import { withPdfPage } from '../editor/pdfSource'

export default function PdfPagePreview({ source, page, width, height }: { source: string; page: number; width: number; height: number }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '180px 0px' })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !visible) return
    let cancelled = false
    let drawing: RenderTask | undefined
    setFailed(false)
    void withPdfPage(source, page, async (pdf) => {
      if (cancelled) return
      const natural = pdf.getViewport({ scale: 1 })
      const scale = Math.min(width / natural.width, height / natural.height) * window.devicePixelRatio
      const viewport = pdf.getViewport({ scale: Math.min(scale, Math.sqrt(5_000_000 / (natural.width * natural.height))) })
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      drawing = pdf.render({ canvas, viewport })
      await drawing.promise
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      drawing?.cancel()
      canvas.width = 1
      canvas.height = 1
    }
  }, [source, page, width, height, visible])
  return <>
    <canvas className="editor-page-background pdf-page-preview" ref={canvasRef} width={1} height={1} role="img" aria-label="PDF 原页" />
    {failed && <span className="pdf-preview-failure" role="status">原页加载失败</span>}
  </>
}
