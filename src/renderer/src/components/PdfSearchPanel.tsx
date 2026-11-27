import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { NotePage } from '../../../shared/editor'
import { findPdfText, getIndexedPage, indexOcrText, indexPdf, recognizePdfPages } from '../editor/pdfSearch'
import type { IndexedPage, PdfHit, PdfTextIndex } from '../editor/pdfSearch'

type Props = {
  open: boolean
  initialQuery: string
  pages: NotePage[]
  currentPageId: string
  activeHit: PdfHit | null
  onJump: (hit: PdfHit) => void
  onClear: () => void
  onClose: () => void
  onOcrUpdated: () => void
}

export default function PdfSearchPanel({
  open,
  initialQuery,
  pages,
  currentPageId,
  activeHit,
  onJump,
  onClear,
  onClose,
  onOcrUpdated
}: Props): React.JSX.Element | null {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [attempt, setAttempt] = useState(0)
  const [ocr, setOcr] = useState(new Map<string, IndexedPage & { copyText: string }>())
  const [progress, setProgress] = useState('')
  const [copyStatus, setCopyStatus] = useState<{ pageId: string; message: string }>()
  const [recognizing, setRecognizing] = useState(false)
  const scanTask = useRef<AbortController | null>(null)
  const [loaded, setLoaded] = useState<{
    key: string
    index: PdfTextIndex
    failed: number
  } | null>(null)
  const sources = [...new Set(pages.flatMap((page) =>
    page.sourcePdfId && page.sourcePageNumber ? [page.sourcePdfId] : []
  ))].sort().join(',')
  const key = `${sources}:${attempt}`
  const index = loaded?.key === key ? loaded.index : null
  const result = useMemo(
    () => index ? findPdfText(index, pages, query, ocr) : { hits: [], total: 0 },
    [index, pages, query, ocr]
  )
  const active = result.hits.findIndex((hit) =>
    hit.pageId === activeHit?.pageId && hit.offset === activeHit.offset
  )
  const scans = index ? pages.filter((page) => page.sourcePdfId && page.sourcePageNumber && !getIndexedPage(index, page)?.text.trim() && !ocr.has(page.id)) : []
  const currentPdf = pages.find((page) => page.id === currentPageId && page.sourcePdfId && page.sourcePageNumber)
  const currentOcrText = currentPdf && ocr.get(currentPdf.id)?.copyText

  useEffect(() => {
    if (open) {
      input.current?.focus()
      input.current?.select()
    }
  }, [open])

  useEffect(() => {
    if (!open || !sources || index) return
    const abort = new AbortController()
    void (async () => {
      const next: PdfTextIndex = new Map()
      let failed = 0
      for (const id of sources.split(',')) {
        try {
          next.set(id, await indexPdf(id, abort.signal))
        } catch {
          if (abort.signal.aborted) return
          failed++
        }
        if (abort.signal.aborted) return
      }
      const cached = await Promise.all(pages.flatMap((page) => page.sourcePdfId && page.sourcePageNumber
        ? [window.liftInk.loadPdfOcr(page.sourcePdfId, page.sourcePageNumber).then((result) =>
            result ? [page.id, { ...indexOcrText(result), copyText: result.text }] as const : null
          ).catch(() => null)]
        : []))
      if (abort.signal.aborted) return
      setOcr((current) => new Map([...current, ...cached.filter((entry) => entry !== null)]))
      setLoaded({ key, index: next, failed })
    })()
    return () => abort.abort()
  }, [index, key, open, sources, pages])

  useEffect(() => () => scanTask.current?.abort(), [])

  if (!open) return null

  function move(direction: number): void {
    if (!result.hits.length) return
    const start = active < 0 ? (direction > 0 ? -1 : 0) : active
    onJump(result.hits[(start + direction + result.hits.length) % result.hits.length])
  }
  function recognize(entries: NotePage[], refresh = false): void {
    if (scanTask.current || !entries.length) return
    const task = new AbortController()
    scanTask.current = task
    setRecognizing(true)
    setCopyStatus(undefined)
    setProgress(`正在识别 0 / ${entries.length} 页…`)
    let recognized = 0
    void recognizePdfPages(entries, task.signal, (id, result) => {
      if (result.text.trim()) recognized++
      setOcr((previous) => new Map(previous).set(id, { ...indexOcrText(result), copyText: result.text }))
      onOcrUpdated()
    }, (done) => setProgress(`正在识别 ${done} / ${entries.length} 页…`), refresh).then((failed) => {
      const empty = entries.length - failed - recognized
      setProgress(`OCR 完成，${recognized} 页识别出文字${empty ? `，${empty} 页未识别出文字` : ''}${failed ? `，${failed} 页处理失败` : ''}`)
    }, () => setProgress(task.signal.aborted ? '已停止识别' : 'OCR 失败，请重试')).finally(() => {
      scanTask.current = null
      setRecognizing(false)
    })
  }

  return (
    <section className="editor-pdf-search" aria-label="PDF 原文搜索">
      <div className="editor-pdf-search-row">
        <input
          ref={input}
          type="search"
          aria-label="搜索 PDF 原文"
          placeholder="搜索当前笔记里的 PDF 原文"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            onClear()
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              move(event.shiftKey || event.key === 'ArrowUp' ? -1 : 1)
            }
          }}
        />
        <button type="button" aria-label="上一个 PDF 命中" onClick={() => move(-1)} disabled={!result.hits.length}>
          <ChevronUp size={17} />
        </button>
        <button type="button" aria-label="下一个 PDF 命中" onClick={() => move(1)} disabled={!result.hits.length}>
          <ChevronDown size={17} />
        </button>
        <button type="button" aria-label="关闭 PDF 搜索" onClick={onClose}><X size={17} /></button>
      </div>
      <div className="editor-pdf-search-status" role="status">
        {!sources ? '当前笔记没有可搜索的 PDF 页面' : !index ? '正在读取 PDF 文本层…' :
          query.trim() ? (result.total ? `${result.total} 处匹配` : '没有匹配的原文') : '输入关键词查找 PDF 原文'}
        {active >= 0 && ` · 第 ${active + 1} 处`}
        {result.total > result.hits.length && ` · 显示前 ${result.hits.length} 处`}
        {scans.length > 0 && ` · ${scans.length} 页没有可搜索的文字层`}
        {index && !!loaded?.failed && (
          <> · {loaded.failed} 份 PDF 无法读取 <button onClick={() => setAttempt((value) => value + 1)}>重试</button></>
        )}
      </div>
      {index && (currentPdf || scans.length > 0) && (
        <div className="editor-ocr-actions">
          {currentPdf && <button type="button" disabled={recognizing} onClick={() => recognize([currentPdf], ocr.has(currentPdf.id))}>
            {ocr.has(currentPdf.id) ? 'OCR 重新识别当前页' : 'OCR 识别当前页'}
          </button>}
          {scans.length > 0 && <button type="button" disabled={recognizing} onClick={() => recognize(scans)}>OCR 识别扫描页（{scans.length}）</button>}
          {currentPdf && currentOcrText?.trim() && <button type="button" disabled={recognizing} onClick={() => {
            void navigator.clipboard.writeText(currentOcrText).then(
              () => setCopyStatus({ pageId: currentPdf.id, message: '已复制当前页 OCR 文字' }),
              () => setCopyStatus({ pageId: currentPdf.id, message: '无法访问剪贴板，请重试' })
            )
          }}>复制当前页 OCR 文字</button>}
          {recognizing && <button type="button" onClick={() => scanTask.current?.abort()}>停止识别</button>}
          {progress && <span role="status">{progress}</span>}
          {currentPdf && copyStatus?.pageId === currentPdf.id && <span role="status">{copyStatus.message}</span>}
        </div>
      )}
      {result.hits.length > 0 && (
        <ol className="editor-pdf-search-results" aria-label="PDF 搜索结果">
          {result.hits.map((hit, index) => (
            <li key={`${hit.pageId}:${hit.offset}`}>
              <button type="button" aria-current={index === active ? 'true' : undefined} onClick={() => onJump(hit)}>
                <strong>第 {hit.pageNumber} 页</strong><span>{hit.excerpt}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
