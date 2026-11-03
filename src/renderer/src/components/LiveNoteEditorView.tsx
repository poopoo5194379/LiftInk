import { useEffect, useMemo, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import {
  Camera,
  ChevronLeft,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  LassoSelect,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Pin,
  Plus,
  Redo2,
  Undo2
} from 'lucide-react'
import FolderPicker from './FolderPicker'
import CaptureDialog from './CaptureDialog'
import { DocumentHistory, emptyDocument } from '../editor/history'
import type {
  CapturedScreen,
  ImageElement,
  InkElement,
  InkPoint,
  NoteDocument,
  PageElement,
  PaperKind,
  StoredImage
} from '../../../shared/editor'

type NotePreview = { id: string; title: string; folder: string; kind: string; summary: string }
type Props = {
  note: NotePreview
  folders: string[]
  onBack: () => void
  onTitleChange: (title: string) => void
  onFolderChange: (folder: string) => void
  onOpenInputPoc: () => void
}
type Tool = 'pen' | 'highlighter' | 'eraser' | 'select' | 'hand'
type Drag =
  | { kind: 'ink'; id: number; points: InkPoint[]; tool: 'pen' | 'highlighter' }
  | { kind: 'erase'; id: number; ids: Set<string> }
  | {
      kind: 'image'
      id: number
      original: ImageElement
      start: InkPoint
      resize: boolean
      latest: ImageElement
    }
  | { kind: 'hand'; id: number; x: number; y: number; left: number; top: number }
const toolButtons: { id: Tool; name: string; Icon: typeof PenLine }[] = [
  { id: 'pen', name: '钢笔', Icon: PenLine },
  { id: 'highlighter', name: '荧光笔', Icon: Highlighter },
  { id: 'eraser', name: '橡皮擦', Icon: Eraser },
  { id: 'select', name: '选择', Icon: LassoSelect },
  { id: 'hand', name: '移动画布', Icon: Hand }
]
const inkPalette = ['#433654', '#7461ba', '#c96f91', '#577da4']

function strokePath(points: InkPoint[], width: number): string {
  if (!points.length) return ''
  const outline = getStroke(
    points.map(({ x, y, pressure }) => [x, y, pressure]),
    {
      size: width,
      thinning: 0.65,
      smoothing: 0.5,
      streamline: 0.45,
      simulatePressure: false
    }
  )
  if (!outline.length) return ''
  return `M${outline.map(([x, y]) => `${x} ${y}`).join('L')}Z`
}
function distanceToSegment(x: number, y: number, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function dimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = reject
    image.src = dataUrl
  })
}

export default function LiveNoteEditorView({
  note,
  folders,
  onBack,
  onTitleChange,
  onFolderChange,
  onOpenInputPoc
}: Props): React.JSX.Element {
  const [tool, setTool] = useState<Tool>('pen')
  const [inkColor, setInkColor] = useState(inkPalette[0])
  const [hover, setHover] = useState<InkPoint | null>(null)
  const [document, setDocument] = useState<NoteDocument | null>(null)
  const [pageId, setPageId] = useState('')
  const [pagesOpen, setPagesOpen] = useState(false)
  const [livePoints, setLivePoints] = useState<InkPoint[]>([])
  const [erasing, setErasing] = useState<Set<string>>(new Set())
  const [previewImage, setPreviewImage] = useState<ImageElement | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({})
  const [missingAssets, setMissingAssets] = useState<Set<string>>(new Set())
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [saveState, setSaveState] = useState('正在打开…')
  const [historyFlags, setHistoryFlags] = useState({ undo: false, redo: false })
  const [capture, setCapture] = useState<CapturedScreen | null>(null)
  const historyRef = useRef<DocumentHistory | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveSequence = useRef(0)
  const keysRef = useRef({ space: false, alt: false })
  const page = document?.pages.find((item) => item.id === pageId) ?? document?.pages[0]
  const selectedImage = page?.elements.find(
    (item): item is ImageElement => item.kind === 'image' && item.id === selectedId
  )
  const shownImage = previewImage?.id === selectedId ? previewImage : selectedImage
  const inkPaths = useMemo(
    () =>
      new Map(
        (page?.elements ?? []).flatMap((element) =>
          element.kind === 'ink'
            ? [[element.id, strokePath(element.points, element.width)] as const]
            : []
        )
      ),
    [page?.elements]
  )

  useEffect(() => {
    let cancelled = false
    void window.liftInk
      .loadDocument(note.id)
      .then(async ({ value: loaded, recovered }) => {
        if (cancelled) return
        const initial = loaded ?? emptyDocument(note.id)
        historyRef.current = new DocumentHistory(initial)
        setHistoryFlags({ undo: false, redo: false })
        setDocument(initial)
        setPageId(initial.pages[0].id)
        setSelectedId(null)
        const openingSequence = saveSequence.current
        if (!loaded) {
          try {
            await window.liftInk.saveDocument(initial)
            if (!cancelled && openingSequence === saveSequence.current) setSaveState('已保存')
          } catch (error) {
            if (!cancelled && openingSequence === saveSequence.current)
              setSaveState(`保存失败：${String(error)}`)
          }
        }
        if (cancelled) return
        if (loaded && openingSequence === saveSequence.current) setSaveState('已保存')
        setRecoveryNotice(recovered ? '已从备份恢复，请核对最近的修改' : '')
        const ids = [
          ...new Set(
            initial.pages.flatMap((item) =>
              item.elements.flatMap((element) =>
                element.kind === 'image' ? [element.assetId] : []
              )
            )
          )
        ]
        const images = await Promise.allSettled(ids.map((id) => window.liftInk.loadImage(id)))
        if (!cancelled) {
          setAssetUrls(
            Object.fromEntries(
              images.flatMap((result) =>
                result.status === 'fulfilled'
                  ? [[result.value.assetId, result.value.dataUrl] as const]
                  : []
              )
            )
          )
          setMissingAssets(new Set(ids.filter((_, index) => images[index].status === 'rejected')))
        }
      })
      .catch((error) => {
        if (!cancelled) setSaveState(`打开失败：${String(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [note.id])

  const saveLatest = (next: NoteDocument): void => {
    setSaveState('保存中…')
    const sequence = ++saveSequence.current
    void window.liftInk
      .saveDocument(next)
      .then(() => {
        if (sequence === saveSequence.current) setSaveState('已保存')
      })
      .catch((error) => {
        if (sequence === saveSequence.current) setSaveState(`保存失败：${String(error)}`)
      })
  }
  const publish = (next: NoteDocument): void => {
    setDocument(next)
    setHistoryFlags({
      undo: historyRef.current?.canUndo ?? false,
      redo: historyRef.current?.canRedo ?? false
    })
    saveLatest(next)
  }
  const undo = (): void => {
    if (historyRef.current?.canUndo) {
      const next = historyRef.current.undo()
      if (!next.pages.some((item) => item.id === pageId)) setPageId(next.pages[0].id)
      publish(next)
    }
  }
  const redo = (): void => {
    if (historyRef.current?.canRedo) publish(historyRef.current.redo())
  }
  const insertStoredImage = async (image: StoredImage): Promise<void> => {
    const history = historyRef.current
    const currentPage = history?.current.pages.find((item) => item.id === pageId)
    if (!history || !currentPage) return
    const size = await dimensions(image.dataUrl)
    const width = Math.min(460, size.width)
    const element: ImageElement = {
      kind: 'image',
      id: crypto.randomUUID(),
      assetId: image.assetId,
      x: 145,
      y: 180,
      width,
      height: Math.max(1, Math.round((width * size.height) / size.width))
    }
    setAssetUrls((current) => ({ ...current, [image.assetId]: image.dataUrl }))
    publish(history.changeElements(currentPage.id, [{ id: element.id, after: element }]))
    setSelectedId(element.id)
    setTool('select')
  }
  const insertFile = async (file: File): Promise<void> => {
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20_000_000)
        throw new Error('仅支持小于 20 MB 的 PNG、JPEG、WebP')
      const dataUrl = await readFile(file)
      await insertStoredImage(await window.liftInk.storeImage(file.type, dataUrl.split(',')[1]))
    } catch (error) {
      setSaveState(`图片导入失败：${String(error)}`)
    }
  }
  const startCapture = async (): Promise<void> => {
    try {
      setSaveState('正在截取当前屏幕…')
      setCapture(await window.liftInk.captureScreen())
      setSaveState('已保存')
    } catch (error) {
      setSaveState(`截图失败：${String(error)}`)
    }
  }
  const acceptCapture = async (mode: 'note' | 'pin', dataUrl: string): Promise<void> => {
    try {
      const image = await window.liftInk.storeImage('image/png', dataUrl.split(',')[1])
      if (mode === 'note') await insertStoredImage(image)
      else await window.liftInk.pinImage(image.assetId)
    } catch (error) {
      setSaveState(`截图处理失败：${String(error)}`)
      throw error
    }
  }
  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      if (target.closest('input,textarea,[contenteditable="true"]')) return
      if (event.code === 'Space') {
        event.preventDefault()
        keysRef.current.space = true
      }
      if (event.key === 'Alt') {
        event.preventDefault()
        keysRef.current.alt = true
      }
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === 'z' || key === 'y') {
          event.preventDefault()
          if (key === 'y' || event.shiftKey) redo()
          else undo()
        }
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedId &&
        page &&
        historyRef.current
      ) {
        publish(historyRef.current.changeElements(page.id, [{ id: selectedId, after: null }]))
        setSelectedId(null)
      }
    }
    const paste = (event: ClipboardEvent): void => {
      if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return
      const data = event.clipboardData
      const image =
        [...(data?.files ?? [])].find((file) => file.type.startsWith('image/')) ??
        [...(data?.items ?? [])]
          .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
          ?.getAsFile()
      if (image) {
        event.preventDefault()
        void insertFile(image)
      }
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') keysRef.current.space = false
      if (event.key === 'Alt') keysRef.current.alt = false
    }
    const blur = (): void => {
      keysRef.current = { space: false, alt: false }
    }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
      window.removeEventListener('paste', paste)
    }
  })

  const pointOnPage = (event: React.PointerEvent<SVGSVGElement>): InkPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * 750,
      y: ((event.clientY - rect.top) / rect.height) * 980,
      pressure: event.pointerType === 'pen' ? Math.max(0.05, event.pressure) : 0.5
    }
  }
  const hitInk = (point: InkPoint): InkElement | null => {
    for (const element of [...(page?.elements ?? [])].reverse()) {
      if (
        element.kind === 'ink' &&
        element.points.some(
          (entry, index) =>
            index > 0 &&
            distanceToSegment(point.x, point.y, element.points[index - 1], entry) <
              Math.max(9, element.width)
        )
      )
        return element
    }
    return null
  }
  const hitImage = (point: InkPoint): ImageElement | null => {
    for (const element of [...(page?.elements ?? [])].reverse()) {
      if (
        element.kind === 'image' &&
        point.x >= element.x &&
        point.y >= element.y &&
        point.x <= element.x + element.width &&
        point.y <= element.y + element.height
      )
        return element
    }
    return null
  }
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (
      !page ||
      !historyRef.current ||
      event.button !== 0 ||
      (event.pointerType === 'pen' && !(event.buttons & 1) && !(event.buttons & 32))
    )
      return
    const point = pointOnPage(event)
    if (keysRef.current.alt) {
      const hit = hitInk(point)
      if (hit) setInkColor(hit.color)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (keysRef.current.space && scrollRef.current) {
      const scroll = scrollRef.current
      dragRef.current = {
        kind: 'hand',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: scroll.scrollLeft,
        top: scroll.scrollTop
      }
    } else if (tool === 'pen' || tool === 'highlighter') {
      dragRef.current = { kind: 'ink', id: event.pointerId, points: [point], tool }
      setLivePoints([point])
    } else if (tool === 'eraser') {
      const hit = hitInk(point)
      const ids = new Set(hit ? [hit.id] : [])
      dragRef.current = { kind: 'erase', id: event.pointerId, ids }
      setErasing(new Set(ids))
    } else if (tool === 'select') {
      const resizing = (event.target as SVGElement).dataset.handle === 'resize'
      const image = (resizing ? selectedImage : null) ?? hitImage(point)
      setSelectedId(image?.id ?? hitInk(point)?.id ?? null)
      if (image)
        dragRef.current = {
          kind: 'image',
          id: event.pointerId,
          original: image,
          start: point,
          latest: image,
          resize: resizing
        }
    } else if (scrollRef.current) {
      const scroll = scrollRef.current
      dragRef.current = {
        kind: 'hand',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: scroll.scrollLeft,
        top: scroll.scrollTop
      }
    }
  }
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) {
      setHover(event.pointerType === 'pen' && event.buttons === 0 ? pointOnPage(event) : null)
      return
    }
    if (drag.kind === 'hand') {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = drag.left - event.clientX + drag.x
        scrollRef.current.scrollTop = drag.top - event.clientY + drag.y
      }
    } else if (drag.kind === 'ink') {
      const rect = event.currentTarget.getBoundingClientRect()
      const entries = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
      for (const entry of entries.length ? entries : [event.nativeEvent]) {
        const point: InkPoint = {
          x: ((entry.clientX - rect.left) / rect.width) * 750,
          y: ((entry.clientY - rect.top) / rect.height) * 980,
          pressure: entry.pointerType === 'pen' ? Math.max(0.05, entry.pressure) : 0.5
        }
        const last = drag.points.at(-1)!
        if (Math.hypot(point.x - last.x, point.y - last.y) > 0.4) drag.points.push(point)
      }
      setLivePoints([...drag.points])
    } else if (drag.kind === 'erase') {
      const hit = hitInk(pointOnPage(event))
      if (hit) {
        drag.ids.add(hit.id)
        setErasing(new Set(drag.ids))
      }
    } else {
      const point = pointOnPage(event)
      const dx = point.x - drag.start.x,
        dy = point.y - drag.start.y
      drag.latest = drag.resize
        ? {
            ...drag.original,
            width: Math.max(40, drag.original.width + dx),
            height: Math.max(40, drag.original.height + dy)
          }
        : { ...drag.original, x: drag.original.x + dx, y: drag.original.y + dy }
      setPreviewImage(drag.latest)
    }
  }
  const pointerUp = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId || !page || !historyRef.current) return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag.kind === 'ink') {
      const stroke: InkElement = {
        kind: 'ink',
        id: crypto.randomUUID(),
        color: drag.tool === 'highlighter' ? '#d9bc47' : inkColor,
        width: drag.tool === 'highlighter' ? 18 : 4,
        points: drag.points
      }
      publish(historyRef.current.changeElements(page.id, [{ id: stroke.id, after: stroke }]))
    } else if (drag.kind === 'erase' && drag.ids.size) {
      publish(
        historyRef.current.changeElements(
          page.id,
          [...drag.ids].map((id) => ({ id, after: null }))
        )
      )
    } else if (
      drag.kind === 'image' &&
      (drag.latest.x !== drag.original.x ||
        drag.latest.y !== drag.original.y ||
        drag.latest.width !== drag.original.width ||
        drag.latest.height !== drag.original.height)
    ) {
      publish(
        historyRef.current.changeElements(page.id, [{ id: drag.original.id, after: drag.latest }])
      )
    }
    dragRef.current = null
    setLivePoints([])
    setErasing(new Set())
    setPreviewImage(null)
  }
  const pointerCancel = (): void => {
    dragRef.current = null
    setLivePoints([])
    setErasing(new Set())
    setPreviewImage(null)
    keysRef.current = { space: false, alt: false }
  }
  const renderElement = (element: PageElement): React.JSX.Element | null => {
    if (erasing.has(element.id)) return null
    if (element.kind === 'ink') {
      return (
        <path
          key={element.id}
          d={inkPaths.get(element.id) ?? ''}
          fill={element.color}
          opacity={element.width > 10 ? 0.55 : 1}
        />
      )
    }
    const image = previewImage?.id === element.id ? previewImage : element
    if (missingAssets.has(element.assetId))
      return (
        <g key={element.id} aria-label="图片资源缺失">
          <rect
            x={image.x}
            y={image.y}
            width={image.width}
            height={image.height}
            fill="#fff5f5"
            stroke="#c96f91"
            strokeDasharray="6 5"
          />
          <text x={image.x + 12} y={image.y + 24} fill="#8e4262" fontSize="14">
            图片资源缺失
          </text>
        </g>
      )
    return (
      <image
        key={element.id}
        href={assetUrls[element.assetId]}
        x={image.x}
        y={image.y}
        width={image.width}
        height={image.height}
        preserveAspectRatio="none"
      />
    )
  }

  return (
    <section className="editor-view" aria-label="笔记页面">
      <header className="editor-topbar">
        <button className="editor-back" aria-label="返回上一页" onClick={onBack}>
          <ChevronLeft size={20} />
          <span>返回</span>
        </button>
        <div className="editor-document">
          <input
            aria-label="笔记标题"
            value={note.title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <FolderPicker value={note.folder} folders={folders} onChange={onFolderChange} />
        </div>
        <div className="editor-top-actions">
          <span className="editor-save-state" aria-live="polite">
            {saveState}
          </span>
          <button className="editor-input-test" onClick={onOpenInputPoc}>
            输入测试
          </button>
          <button
            className="editor-icon"
            aria-label="撤销"
            disabled={!historyFlags.undo}
            onClick={undo}
            title="Ctrl/Cmd+Z"
          >
            <Undo2 size={18} />
          </button>
          <button
            className="editor-icon"
            aria-label="重做"
            disabled={!historyFlags.redo}
            onClick={redo}
            title="Ctrl/Cmd+Shift+Z"
          >
            <Redo2 size={18} />
          </button>
          <button
            className={`editor-pages-toggle ${pagesOpen ? 'active' : ''}`}
            aria-label={pagesOpen ? '收起页面缩略图' : '展开页面缩略图'}
            aria-expanded={pagesOpen}
            onClick={() => setPagesOpen(!pagesOpen)}
          >
            {pagesOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
            <span>页面</span>
          </button>
        </div>
      </header>
      {(saveState.startsWith('保存失败') || recoveryNotice || missingAssets.size > 0) && (
        <div className="editor-storage-warning" role="alert">
          {saveState.startsWith('保存失败') && <span>{saveState}</span>}
          {recoveryNotice && <span>{recoveryNotice}</span>}
          {missingAssets.size > 0 && <span>{missingAssets.size} 张图片资源缺失</span>}
          {saveState.startsWith('保存失败') && document && (
            <button onClick={() => saveLatest(document)}>重试保存</button>
          )}
        </div>
      )}
      <div className="editor-body">
        <div className="editor-canvas-column">
          <div className="editor-toolbox" role="toolbar" aria-label="书写工具">
            {toolButtons.map(({ id, name, Icon }) => (
              <button
                key={id}
                aria-label={name}
                aria-pressed={tool === id}
                className={tool === id ? 'active' : ''}
                onClick={() => setTool(id)}
              >
                <Icon size={20} />
              </button>
            ))}
            <span className="tool-divider" />
            <button
              aria-label={`墨色 ${inkColor}`}
              title="切换墨色"
              onClick={() =>
                setInkColor(inkPalette[(inkPalette.indexOf(inkColor) + 1) % inkPalette.length])
              }
            >
              <span className="editor-ink-swatch" style={{ backgroundColor: inkColor }} />
            </button>
            <button aria-label="贴入图片" title="贴入图片" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={19} />
            </button>
            <button aria-label="区域截图" title="区域截图" onClick={() => void startCapture()}>
              <Camera size={19} />
            </button>
            <button
              aria-label="贴到桌面"
              title="将选中图片贴到桌面"
              disabled={!selectedImage}
              onClick={() => {
                if (selectedImage) void window.liftInk.pinImage(selectedImage.assetId)
              }}
            >
              <Pin size={18} />
            </button>
            <input
              ref={fileRef}
              className="editor-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void insertFile(file)
                event.target.value = ''
              }}
            />
          </div>
          <div
            className="editor-canvas"
            ref={scrollRef}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const file = [...event.dataTransfer.files].find((item) =>
                item.type.startsWith('image/')
              )
              if (file) void insertFile(file)
            }}
          >
            {page && (
              <div className={`editor-paper ${page.paper}`}>
                <svg
                  className={`editor-live-canvas tool-${tool}`}
                  aria-label="笔记画布"
                  viewBox="0 0 750 980"
                  preserveAspectRatio="none"
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={pointerCancel}
                  onPointerLeave={() => setHover(null)}
                >
                  {page.elements.map(renderElement)}
                  {livePoints.length > 0 && (
                    <path
                      d={strokePath(livePoints, tool === 'highlighter' ? 18 : 4)}
                      fill={tool === 'highlighter' ? '#d9bc47' : inkColor}
                    />
                  )}
                  {hover && (
                    <circle
                      cx={hover.x}
                      cy={hover.y}
                      r="7"
                      fill="none"
                      stroke={inkColor}
                      strokeWidth="1.3"
                      opacity=".75"
                      pointerEvents="none"
                    />
                  )}
                  {shownImage && (
                    <g className="editor-selection">
                      <rect
                        x={shownImage.x}
                        y={shownImage.y}
                        width={shownImage.width}
                        height={shownImage.height}
                        fill="none"
                        stroke="#7560d0"
                        strokeWidth="2"
                        pointerEvents="none"
                      />
                      <rect
                        data-handle="resize"
                        x={shownImage.x + shownImage.width - 8}
                        y={shownImage.y + shownImage.height - 8}
                        width="16"
                        height="16"
                        rx="3"
                        fill="#7560d0"
                      />
                    </g>
                  )}
                </svg>
                <span className="paper-page-number">
                  {(document?.pages.findIndex((item) => item.id === page.id) ?? 0) + 1}
                </span>
              </div>
            )}
          </div>
          <footer className="editor-statusbar">
            <div className="paper-options" aria-label="纸张样式">
              {(
                [
                  ['lines', '横线'],
                  ['grid', '方格'],
                  ['blank', '空白']
                ] as const
              ).map(([value, name]) => (
                <button
                  key={value}
                  className={page?.paper === value ? 'active' : ''}
                  aria-pressed={page?.paper === value}
                  onClick={() => {
                    if (page && historyRef.current)
                      publish(historyRef.current.setPaper(page.id, value as PaperKind))
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <span>Ctrl/Cmd+Z 撤销 · 粘贴或拖入图片</span>
            <span>
              第 {(document?.pages.findIndex((item) => item.id === pageId) ?? 0) + 1} /{' '}
              {document?.pages.length ?? 1} 页 · 100%
            </span>
          </footer>
        </div>
        {pagesOpen && (
          <aside className="editor-page-manager" aria-label="页面缩略图目录">
            <div className="page-manager-heading">
              <strong>页面</strong>
              <button
                aria-label="新增页面"
                onClick={() => {
                  if (!historyRef.current) return
                  const next = {
                    id: crypto.randomUUID(),
                    paper: (page?.paper ?? 'lines') as PaperKind,
                    elements: []
                  }
                  publish(historyRef.current.addPage(next))
                  setPageId(next.id)
                  setSelectedId(null)
                }}
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="page-manager-list">
              {document?.pages.map((item, index) => (
                <button
                  key={item.id}
                  className={`page-thumbnail ${pageId === item.id ? 'selected' : ''}`}
                  onClick={() => {
                    setPageId(item.id)
                    setSelectedId(null)
                  }}
                >
                  <span className={item.paper} />
                  <small>第 {index + 1} 页</small>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
      {capture && (
        <CaptureDialog screen={capture} onClose={() => setCapture(null)} onResult={acceptCapture} />
      )}
    </section>
  )
}
