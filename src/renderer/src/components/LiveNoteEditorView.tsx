import { useEffect, useEffectEvent, useId, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Activity,
  Bold,
  Camera,
  Crop,
  ChevronLeft,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  LassoSelect,
  Maximize,
  Minimize,
  FileDown,
  FileUp,
  ScanText,
  BookOpen,
  Bookmark,
  Copy,
  Code,
  ChevronUp,
  ChevronDown,
  Trash2,
  Type,
  Italic,
  Strikethrough,
  Shapes,
  SlidersHorizontal,
  ScanEye,
  Timer,
  Split,
  Search,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Pin,
  Plus,
  Redo2,
  Undo2
} from 'lucide-react'
import FolderPicker from './FolderPicker'
import NoteTagPicker from './NoteTagPicker'
import CaptureDialog from './CaptureDialog'
import { BrushWidthControl, EditorButton, ToolPopover } from './EditorControls'
import { clipboardImages, imageDimensions, storeImageFile } from '../editor/imageAsset'
import { canvasTextLines, canvasTextStyle, layoutCanvasText, measureCanvasText, plainCanvasText, positionCanvasText, remapCanvasText, replaceCanvasText, styleCanvasText } from '../editor/canvasText'
import PdfPagePreview from './PdfPagePreview'
import PdfTextOverlay from './PdfTextOverlay'
import { handwritingSignature, visibleHandwriting } from '../editor/inkRecognition'
import PdfSearchPanel from './PdfSearchPanel'
import type { PdfHit } from '../editor/pdfSearch'
import { isPdfFile, preparePdf } from '../editor/pdfImport'
import { MAX_NOTE_PAGES } from '../../../shared/editor'
import { DocumentHistory, emptyDocument, isUnusedContinuation } from '../editor/history'
import { exportPages, makeBackup, pageSvg, renderPng } from '../editor/export'
import { inkOpacity, isHighlighter, isMeaningfulInk, multiplyHighlighter, pagePaintBand, penStyles, straightLinePoints, strokePath } from '../editor/ink'
import { InkInput, type InkSample } from '../editor/inkInput'
import { maxTraceSamples, type InkTrace } from '../editor/inkTrace'
import InkComparison from './InkComparison'
import { pageSize, paperColors, paperPattern, paperSpacings } from '../editor/paper'
import { defaultNotePage, preferenceDefaults, type Preferences } from '../editor/preferences'
import { createEditorAutosave, flushEditorSaves } from '../editor/autosave'
import { useNoteFocus } from '../editor/useNoteFocus'
import { focusTotal, formatDuration } from '../editor/noteActivity'
import { distanceToSegment, splitInk, insidePolygon, elementBounds, moveElement, scaleElement } from '../editor/geometry'
import { base64Of, loadReferencedAssets, readPortable, restoreReferencedAssets } from '../editor/portable'
import { draftText, richNodes } from '../../../shared/noteResources'
import type {
  CapturedScreen,
  CanvasTextFont,
  CanvasTextRange,
  ImageElement,
  InkElement,
  InkPoint,
  NoteDocument,
  PageElement,
  PaperKind,
  PaperSpacing,
  StoredImage,
  NotePage,
  NoteRecord,
  TextElement,
  ShapeElement,
  TapeElement,
  PenStyle
} from '../../../shared/editor'

type NotePreview = {
  id: string
  title: string
  folder: string
  tags?: string[]
  kind: string
  summary: string
  originalTitle?: string
  documentExpected?: boolean
  focusByDay?: NoteRecord['focusByDay']
  workspace?: NoteRecord['workspace']
  draft?: NoteRecord['draft']
}
type ImageDrop = (pageId: string, images: ImageElement[], urls: Record<string, string>) => Promise<void>
type Props = {
  note: NotePreview
  folders: string[]
  otherNotes: NotePreview[]
  onBack: () => void
  onTitleChange: (title: string) => void
  onFolderChange: (folder: string) => void
  tagCatalog?: string[]
  onTagsChange?: (tags: string[]) => void
  onCreateTag?: (tag: string) => void
  preferences?: Preferences
  onBrushPreferences?: (patch: Pick<Partial<Preferences>, 'stability' | 'pressureCurve'>) => void
  saveDraft?: (document: NoteDocument) => Promise<void>
  onDocumentSaved?: (id: string, timestamp: number, pages: number) => void
  initialPdfQuery?: string
  onPdfTextChanged?: (id: string) => void
  onFocusTime?: (id: string, day: string, ms: number, closing?: boolean) => void
  onActivate?: (id: string) => void
  focusNoteId?: string
  embedded?: boolean
  requestedPageId?: string
  imageDropRef?: React.Ref<ImageDrop>
  highlightedDropPage?: string
  renderCompanion?: (id: string, close: () => void) => React.ReactNode
  initialCountdown?: number
  onCountdownComplete?: () => void
  onChangeOtherNote?: (id: string, patch: { title?: string; folder?: string; tags?: string[] }) => void
}
type Tool = 'pen' | 'highlighter' | 'eraser' | 'select' | 'hand' | 'text' | 'shape' | 'tape'
type EditorPrompt = { kind: 'text' | 'layer' | 'bookmark'; pageId: string; point?: InkPoint; elementId?: string }
type Brush = Required<Pick<InkElement, 'brush' | 'color' | 'width' | 'pressureSensitive'>> &
  Pick<InkElement, 'penStyle' | 'stability' | 'pressureCurve' | 'inkVersion' | 'pressureInput'>
type ToolPanel = 'pen' | 'highlighter' | 'eraser' | 'brush' | 'width' | 'highlight-width'
type InkDrag = {
  kind: 'ink'
  id: number
  pageId: string
  input: InkInput
  brush: Brush
  stylus: boolean
  layerId: string
  inverse: DOMMatrix
  preview: SVGPathElement
  screenScale: number
  holdTimer?: number
  holdAnchor?: InkPoint
  straightened?: boolean
  trace?: InkTrace
}
type EraseDrag = { kind: 'erase'; id: number; pageId: string; previous: InkPoint; radius: number; fragments: Map<string, InkElement[]>; candidates: { stroke: InkElement; bounds: ReturnType<typeof elementBounds> }[] }
type Drag =
  | InkDrag
  | EraseDrag
  | { kind: 'lasso'; id: number; pageId: string; points: InkPoint[] }
  | { kind: 'selection'; id: number; pageId: string; start: InkPoint; ids: string[] }
  | { kind: 'shape'; id: number; pageId: string; start: InkPoint; current: InkPoint; tool: 'shape' | 'tape' }
  | { kind: 'resize'; id: number; pageId: string; start: InkPoint; original: TextElement | TapeElement | ShapeElement; latest: TextElement | TapeElement | ShapeElement; edge?: string }
  | {
      kind: 'image'
      id: number
      pageId: string
      original: ImageElement
      start: InkPoint
      resize: boolean
      latest: ImageElement
    }
  | { kind: 'hand'; id: number; x: number; y: number; left: number; top: number }
const toolButtons: { id: Tool; name: string; help: string; Icon: typeof PenLine }[] = [
  { id: 'pen', name: '钢笔', help: '自由书写或绘画；画线后按住不动 2 秒可拉直。', Icon: PenLine },
  { id: 'highlighter', name: '荧光笔', help: '用半透明颜色标出重点；画线后按住不动 2 秒可拉直。', Icon: Highlighter },
  { id: 'eraser', name: '橡皮擦', help: '擦除圆圈经过的笔迹。', Icon: Eraser },
  { id: 'select', name: '选择', help: '拖动图片、文字或笔迹；双击文本框编辑（V）。', Icon: LassoSelect },
  { id: 'hand', name: '移动画布', help: '拖动纸面来平移视野。', Icon: Hand },
  { id: 'text', name: '文本', help: '点击纸面添加文字，双击已有文字可编辑。', Icon: Type },
  { id: 'shape', name: '形状', help: '拖动绘制矩形、椭圆或直线。', Icon: Shapes },
  { id: 'tape', name: '遮挡胶带', help: '拖动遮住内容，再点击胶带揭开。', Icon: ScanEye }
]
const inkPalette = [
  { name: '墨黑', color: '#202124' }, { name: '蓝黑', color: '#203e63' },
  { name: '钴蓝', color: '#1558c0' }, { name: '批注红', color: '#c62828' },
  { name: '松绿', color: '#237044' }, { name: '赭棕', color: '#88502c' },
  { name: '藤紫', color: '#7461ba' }, { name: '石墨灰', color: '#62666c' }
]
const highlightPalette = [
  { name: '荧光黄', color: '#eeff00' }, { name: '荧光粉', color: '#ff38b5' },
  { name: '荧光绿', color: '#62ff13' }, { name: '荧光蓝', color: '#00e5ff' },
  { name: '荧光紫', color: '#b652ff' }, { name: '荧光橙', color: '#ff9700' }
]
const toolKeys: Partial<Record<string, Tool>> = { KeyP: 'pen', KeyE: 'eraser', KeyH: 'hand', KeyL: 'select', KeyV: 'select' }

function readInkSample(event: PointerEvent, inverse: DOMMatrix, stylus: boolean): InkSample {
  const { clientX, clientY } = event
  return {
    x: inverse.a * clientX + inverse.c * clientY + inverse.e,
    y: inverse.b * clientX + inverse.d * clientY + inverse.f,
    pressure: stylus ? event.pressure : 0.5,
    time: event.timeStamp
  }
}

function PageRuling({ page }: { page: NotePage }): React.JSX.Element | null {
  const id = useId()
  const pattern = paperPattern(page)
  if (!pattern) return null
  const { width, height } = pageSize(page)
  return (
    <svg className="editor-paper-pattern" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={id} width={pattern.width} height={pattern.height} patternUnits="userSpaceOnUse">
          <path d={pattern.path} fill="none" stroke={pattern.color} strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </svg>
  )
}

export default function LiveNoteEditorView({
  note,
  folders,
  otherNotes,
  renderCompanion,
  initialCountdown,
  onCountdownComplete,
  onBack,
  onTitleChange,
  onFolderChange,
  tagCatalog = [],
  onTagsChange,
  onCreateTag,
  preferences = preferenceDefaults,
  onBrushPreferences,
  saveDraft,
  onDocumentSaved,
  initialPdfQuery = '',
  onPdfTextChanged,
  onFocusTime,
  onActivate,
  focusNoteId,
  embedded = false,
  requestedPageId,
  imageDropRef,
  highlightedDropPage,
  onChangeOtherNote
}: Props): React.JSX.Element {
  const [tool, setTool] = useState<Tool>('pen')
  const [noteFullscreen, setNoteFullscreen] = useState(false)
  const [inkColor, setInkColor] = useState(preferences.paperColor === 'gray' ? '#f8f5fe' : inkPalette[0].color)
  const [highlightColor, setHighlightColor] = useState(highlightPalette[0].color)
  const [penPressure, setPenPressure] = useState(preferences.pressure)
  const [penStyle, setPenStyle] = useState<PenStyle>(preferences.penStyle)
  const [stability, setStability] = useState(preferences.stability)
  const [pressureCurve, setPressureCurve] = useState(preferences.pressureCurve)
  const [eraserSize, setEraserSize] = useState<number | 'page'>(24)
  const [toolPanel, setToolPanel] = useState<{ kind: ToolPanel; anchor: HTMLButtonElement } | null>(null)
  const [inkComparisonOpen, setInkComparisonOpen] = useState(false)
  const lastInkTrace = useRef<InkTrace | null>(null)
  const [hover, setHover] = useState<{ pageId: string; point: InkPoint } | null>(null)
  const [document, setDocument] = useState<NoteDocument | null>(null)
  const [pageId, setPageId] = useState('')
  const [pagesOpen, setPagesOpen] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'pages' | 'layers' | 'bookmarks'>('pages')
  const [activeLayerId, setActiveLayerId] = useState('base')
  const [editorPrompt, setEditorPrompt] = useState<EditorPrompt | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [textSize, setTextSize] = useState(20)
  const [promptSize, setPromptSize] = useState('20')
  const [promptColor, setPromptColor] = useState('#252638')
  const [promptFont, setPromptFont] = useState<CanvasTextFont>('sans')
  const [promptStyles, setPromptStyles] = useState<CanvasTextRange[]>([])
  const [promptSelection, setPromptSelection] = useState({ from: 0, to: 0 })
  const [promptMarkdown, setPromptMarkdown] = useState(true)
  const promptText = useRef<HTMLTextAreaElement>(null)
  const textClipPrefix = useId()
  const [erasedFragments, setErasedFragments] = useState<Map<string, InkElement[]> | null>(null)
  const [previewImage, setPreviewImage] = useState<ImageElement | null>(null)
  const [resizePreview, setResizePreview] = useState<TextElement | TapeElement | ShapeElement | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [lassoPoints, setLassoPoints] = useState<InkPoint[]>([])
  const [dragPreview, setDragPreview] = useState({ dx: 0, dy: 0 })
  const [pageTransfer, setPageTransfer] = useState<{ from: string; to: string; objects: PageElement[]; reference?: boolean } | null>(null)
  const [companionDropPage, setCompanionDropPage] = useState<string>()
  const companionPanel = useRef<HTMLElement>(null)
  const companionImageDrop = useRef<ImageDrop>(null)
  const imageMoveSaving = useRef(false)
  const dragScrollFrame = useRef(0)
  const [pageToDelete, setPageToDelete] = useState<string | null>(null)
  const [shapePreview, setShapePreview] = useState<Drag | null>(null)
  const [penWidth, setPenWidth] = useState(preferences.penWidth)
  const [highlightWidth, setHighlightWidth] = useState(18)
  const [shapePreset, setShapePreset] = useState<'rect' | 'ellipse' | 'line'>('rect')
  const [zoom, setZoom] = useState(1)
  const [availableWidth, setAvailableWidth] = useState(0)
  const wheelAnchor = useRef<{ paper: Element; x: number; y: number; clientX: number; clientY: number } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportRange, setExportRange] = useState<'current' | 'all'>('all')
  const [exportBackground, setExportBackground] = useState(preferences.exportBackground)
  const initialZoomApplied = useRef(false)
  const [importing, setImporting] = useState(false)
  const pdfImportTask = useRef<AbortController | null>(null)
  const [pdfSearchOpen, setPdfSearchOpen] = useState(Boolean(initialPdfQuery))
  const [pdfHit, setPdfHit] = useState<PdfHit | null>(null)
  const [dualOpen, setDualOpen] = useState(false)
  const [dualRatio, setDualRatio] = useState(0.5)
  const dualResize = useRef<number | null>(null)
  const [dualPageId, setDualPageId] = useState('')
  const [dualNoteId, setDualNoteId] = useState(note.id)
  const [dualDocument, setDualDocument] = useState<NoteDocument | null>(null)
  const [selectPdfText, setSelectPdfText] = useState(false)
  const [pendingPdf, setPendingPdf] = useState<{ file: File; before: string } | null>(null)
  const [excerptCrop, setExcerptCrop] = useState<{ url: string; targetPageId: string; sourceNoteId: string; sourcePageId: string; layerId: string } | null>(null)
  const [inkReading, setInkReading] = useState<{ pageId: string; signature: string; text: string } | null>(null)
  const [inkRecognizing, setInkRecognizing] = useState(false)
  const [countdownMinutes, setCountdownMinutes] = useState(initialCountdown ?? 25)
  const [countdownEnd, setCountdownEnd] = useState<number | null>(null)
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null)
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({})
  const [missingAssets, setMissingAssets] = useState<Set<string>>(new Set())
  const [recoveryNotice, setRecoveryNotice] = useState('')
  const [saveState, setSaveState] = useState('正在打开…')
  const [historyFlags, setHistoryFlags] = useState({ undo: false, redo: false })
  const [capture, setCapture] = useState<CapturedScreen | null>(null)
  const [cropTarget, setCropTarget] = useState<{ pageId: string; image: ImageElement; dataUrl: string } | null>(null)
  const historyRef = useRef<DocumentHistory | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const inkFrame = useRef(0)
  const [autosave] = useState(() => createEditorAutosave(() => dragRef.current?.kind === 'ink' || dragRef.current?.kind === 'erase'))
  const hasPendingInk = useRef(false)
  const cachedPaths = useRef(new WeakMap<InkElement, string>())
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const pdfSearchButton = useRef<HTMLButtonElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const saveSequence = useRef(0)
  const draftPersisted = useRef(false)
  const editorRoot = useRef<HTMLElement>(null)
  const keysRef = useRef({ space: false, alt: false })
  const page = document?.pages.find((item) => item.id === pageId) ?? document?.pages[0]
  const eraserLimit = (target?: NotePage): number => {
    const { width, height } = pageSize(target ?? {})
    return Math.max(4, Math.ceil(Math.hypot(width, height)))
  }
  const eraserDiameterFor = (target?: NotePage): number => {
    const limit = eraserLimit(target)
    return eraserSize === 'page' ? limit : Math.min(eraserSize, limit)
  }
  const eraserDiameter = eraserDiameterFor(page)
  const maxEraserDiameter = eraserLimit(page)
  const documentReady = document !== null
  const layers = page?.layers ?? [{ id: 'base', name: '内容', visible: true, locked: false }]
  const activeLayer = layers.find((layer) => layer.id === activeLayerId) ?? layers[0]
  const canEdit = (element: PageElement, targetPage: NotePage): boolean => {
    const layer = targetPage.layers?.find((entry) => entry.id === (element.layerId ?? 'base'))
    return layer?.visible !== false && layer?.locked !== true
  }
  const isVisible = (element: PageElement, targetPage: NotePage): boolean => {
    const layer = targetPage.layers?.find((entry) => entry.id === (element.layerId ?? 'base'))
    return layer?.visible !== false
  }
  const selectedImage = page?.elements.find(
    (item): item is ImageElement => item.kind === 'image' && item.id === selectedId && canEdit(item, page)
  )
  const selectedText = page?.elements.find(
    (item): item is TextElement => item.kind === 'text' && item.id === selectedId && canEdit(item, page)
  )
  const selectedTape = page?.elements.find(
    (item): item is TapeElement => item.kind === 'tape' && item.id === selectedId && canEdit(item, page)
  )
  const selectedShape = page?.elements.find(
    (item): item is ShapeElement => item.kind === 'shape' && item.id === selectedId && canEdit(item, page)
  )
  const shownImage = previewImage?.id === selectedId ? previewImage : selectedImage
  useEffect(() => () => {
    window.cancelAnimationFrame(inkFrame.current)
    if (dragRef.current?.kind === 'ink') window.clearTimeout(dragRef.current.holdTimer)
    dragRef.current = null
    void autosave.flush().catch(() => undefined)
  }, [autosave])
  const focusActive = !focusNoteId ? !embedded : focusNoteId === note.id
  const focusTick = useNoteFocus(note, focusActive, onFocusTime)
  const countdownComplete = useEffectEvent(() => onCountdownComplete?.())
  useEffect(() => {
    if (countdownEnd === null) return
    const interval = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000))
      setCountdownLeft(left)
      if (left === 0) { setCountdownEnd(null); countdownComplete() }
    }, 200)
    return () => window.clearInterval(interval)
  }, [countdownEnd])
  useEffect(() => {
    if (!dualOpen || dualNoteId === note.id || otherNotes.some((entry) => entry.id === dualNoteId && entry.workspace)) return
    let cancelled = false
    void window.liftInk.loadDocument(dualNoteId).then(({ value }) => {
      if (!value || cancelled) return
      setDualDocument(value)
      setDualPageId((current) => value.pages.some((page) => page.id === current) ? current : value.pages[0].id)
    }).catch((error) => { if (!cancelled) setSaveState(`双开失败：${String(error)}`) })
    return () => { cancelled = true }
  }, [dualOpen, dualNoteId, note.id])

  const isNewDraft = useEffectEvent(() => !!saveDraft)
  useEffect(() => {
    let cancelled = false
    const draft = isNewDraft()
    const opening: ReturnType<typeof window.liftInk.loadDocument> = draft
      ? Promise.resolve({ value: null, recovered: false })
      : window.liftInk.loadDocument(note.id)
    void opening
      .then(async ({ value: loaded, recovered }) => {
        if (cancelled) return
        if (!draft && !loaded && (note.documentExpected || note.originalTitle?.startsWith('new-')))
          throw new Error('笔记文档缺失，已阻止创建空白页以保护原内容')
        const initial = loaded ?? emptyDocument(note.id)
        if (!loaded && draft) initial.pages[0] = { ...initial.pages[0], ...defaultNotePage(preferences, note.kind === 'board') }
        historyRef.current = new DocumentHistory(initial)
        setHistoryFlags({ undo: false, redo: false })
        setDocument(historyRef.current.current)
        setPageId(initial.pages[0].id)
        if (draft) { setSaveState('未保存草稿'); return }
        if (loaded && initial.pages.some((page) => page.elements.some((element) =>
          (element.kind === 'image' || element.kind === 'text') && canEdit(element, page)
        ))) setTool((current) => current === 'pen' ? 'select' : current)
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
            initial.pages.flatMap((item) => [
              ...(item.backgroundAssetId ? [item.backgroundAssetId] : []),
              ...item.elements.flatMap((element) => element.kind === 'image' ? [element.assetId] : [])
            ])
          )
        ]
        const images = await Promise.allSettled(ids.map((id) => window.liftInk.loadImage(id)))
        if (!cancelled) {
          const loadedUrls = Object.fromEntries(
            images.flatMap((result) =>
              result.status === 'fulfilled'
                ? [[result.value.assetId, result.value.dataUrl] as const]
                : []
            )
          )
          setAssetUrls((current) => ({ ...loadedUrls, ...current }))
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

  const writeDocument = async (next: NoteDocument): Promise<void> => {
    setSaveState('保存中…')
    const sequence = ++saveSequence.current
    try {
      if (saveDraft && !draftPersisted.current) {
        await saveDraft(next)
        draftPersisted.current = true
      } else await window.liftInk.saveDocument(next)
      if (sequence === saveSequence.current && historyRef.current?.current === next) {
        hasPendingInk.current = false
        setSaveState('已保存')
      }
      onDocumentSaved?.(note.id, Date.now(), next.pages.length)
    } catch (error) {
      setSaveState(`保存失败：${String(error)}`)
      throw error
    }
  }
  const saveLatest = (next: NoteDocument): void => {
    autosave.stage(() => writeDocument(next))
    void autosave.flush().catch(() => undefined)
  }
  const publish = (next: NoteDocument, writing = false): void => {
    setDocument(next)
    setHistoryFlags({
      undo: historyRef.current?.canUndo ?? false,
      redo: historyRef.current?.canRedo ?? false
    })
    if (!saveDraft || draftPersisted.current || hasPendingInk.current ||
        next.sourcePdfId || next.audioAssetId || next.pages.some((entry) => entry.elements.length || entry.backgroundAssetId)) {
      if (writing) {
        hasPendingInk.current = true
        setSaveState((state) => state.startsWith('保存失败') ? state : '待自动保存')
        autosave.stage(() => writeDocument(next))
      } else saveLatest(next)
    }
  }
  useImperativeHandle(imageDropRef, () => async (targetId, images, urls) => {
    const history = historyRef.current
    const target = history?.current.pages.find((item) => item.id === targetId)
    if (!history || !target || imageMoveSaving.current) throw new Error('右侧页面不可用')
    const writable = target.layers?.filter((layer) => layer.visible && !layer.locked)
    const layer = writable?.find((item) => item.id === 'base') ?? writable?.[0]
    if (target.layers?.length && !layer) throw new Error('右侧页面没有可写入的图层')
    imageMoveSaving.current = true
    try {
      const updates = images.map((image) => {
        const id = crypto.randomUUID()
        return { id, after: { ...image, id, layerId: layer?.id ?? 'base' } }
      })
      setAssetUrls((current) => ({ ...current, ...urls }))
      const next = history.changeElements(targetId, updates)
      publish(next)
      try { await autosave.flush() }
      catch (error) {
        if (history.current === next) publish(history.undo())
        throw error
      }
    } finally { imageMoveSaving.current = false }
  })
  const undo = (): void => {
    if (historyRef.current?.canUndo) {
      const next = historyRef.current.undo()
      if (!next.pages.some((item) => item.id === pageId)) setPageId(next.pages[0].id)
      publish(next, hasPendingInk.current)
    }
  }
  const redo = (): void => {
    if (historyRef.current?.canRedo) publish(historyRef.current.redo(), hasPendingInk.current)
  }
  const insertStoredImage = async (image: StoredImage): Promise<void> => {
    const history = historyRef.current
    const currentPage = history?.current.pages.find((item) => item.id === pageId)
    if (!history || !currentPage) return
    const size = await imageDimensions(image.dataUrl)
    const width = Math.min(460, size.width)
    const element: ImageElement = {
      kind: 'image',
      id: crypto.randomUUID(),
      assetId: image.assetId,
      x: 145,
      y: 180,
      width,
      height: Math.max(1, Math.round((width * size.height) / size.width)),
      layerId: activeLayer.id
    }
    setAssetUrls((current) => ({ ...current, [image.assetId]: image.dataUrl }))
    publish(history.changeElements(currentPage.id, [{ id: element.id, after: element }]))
    setSelectedId(element.id)
    setSelectedIds([element.id])
    setTool('select')
  }
  const insertFile = async (file: File): Promise<void> => {
    try {
      await insertStoredImage(await storeImageFile(file))
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
  const acceptCrop = async (_mode: 'note' | 'pin', dataUrl: string, fraction: { x: number; y: number; width: number; height: number }): Promise<void> => {
    if (!cropTarget) return
    const { pageId, image } = cropTarget
    const asset = await window.liftInk.storeImage('image/png', dataUrl.split(',')[1])
    const history = historyRef.current
    const currentPage = history?.current.pages.find((entry) => entry.id === pageId)
    const current = currentPage?.elements.find((element) => element.id === image.id)
    if (!history || !currentPage || current !== image || !canEdit(image, currentPage)) {
      throw new Error('图片已发生变化，请重新选择。')
    }
    const cropped: ImageElement = {
      ...image,
      assetId: asset.assetId,
      x: image.x + image.width * fraction.x,
      y: image.y + image.height * fraction.y,
      width: image.width * fraction.width,
      height: image.height * fraction.height
    }
    setAssetUrls((current) => ({ ...current, [asset.assetId]: asset.dataUrl }))
    publish(history.changeElements(pageId, [{ id: image.id, after: cropped }]))
  }
  const exportNote = async (format: 'pdf' | 'png' | 'liftink'): Promise<void> => {
    if (!document) return
    try {
      setSaveState('正在准备导出…')
      let bytes: Uint8Array
      let kind: 'pdf' | 'png' | 'zip' | 'liftink' = format
      if (format === 'liftink') {
        const media = await loadReferencedAssets([{ document }])
        bytes = await makeBackup(document, media)
      } else {
        const last = document.pages.at(-1)
        const printable = last && document.pages.length > 1 && isUnusedContinuation(last) ? document.pages.slice(0, -1) : document.pages
        const pageIds = exportRange === 'all' ? printable.map((entry) => entry.id) : [page?.id ?? document.pages[0].id]
        const selected = document.pages.filter((entry) => pageIds.includes(entry.id))
        const ids = new Set(selected.flatMap((entry) => [
          ...(exportBackground && (format !== 'pdf' || !entry.sourcePdfId) && entry.backgroundAssetId ? [entry.backgroundAssetId] : []),
          ...entry.elements.flatMap((item) => item.kind === 'image' ? [item.assetId] : [])
        ]))
        const images = Object.fromEntries(await Promise.all([...ids].map(async (id) => {
          const dataUrl = assetUrls[id] ?? (await window.liftInk.loadImage(id)).dataUrl
          return [id, dataUrl]
        })))
        bytes = await exportPages(document, images, format, pageIds, exportBackground, preferences.exportScale)
        if (format === 'png' && pageIds.length > 1) kind = 'zip'
      }
      const path = await window.liftInk.saveExport(kind, note.title.trim() || '未命名笔记', base64Of(bytes))
      setSaveState(path ? `已导出：${path}` : '已取消导出')
      if (path) setExportOpen(false)
    } catch (error) { setSaveState(`导出失败：${String(error)}`) }
  }
  const restoreBackup = async (file: File): Promise<void> => {
    try {
      setImporting(true)
      const { entries, zip } = await readPortable(file)
      if (entries.length !== 1 || !entries[0].document || entries[0].document.richText) throw new Error('请选择一篇手写或 PDF 笔记的备份')
      const source = entries[0].document
      const restored = { ...source, noteId: note.id, excerpts: source.excerpts?.map((excerpt) =>
        excerpt.sourceNoteId === source.noteId ? { ...excerpt, sourceNoteId: note.id } : excerpt) }
      await restoreReferencedAssets(zip, [{ document: restored }])
      if (!historyRef.current) throw new Error('笔记尚未打开')
      const ids = restored.pages.flatMap((entry) => [entry.backgroundAssetId, ...entry.elements.filter((element) => element.kind === 'image').map((element) => element.assetId)]).filter((id): id is string => Boolean(id))
      const loaded = await Promise.all(ids.map((id) => window.liftInk.loadImage(id)))
      publish(historyRef.current.replace(restored))
      setAssetUrls(Object.fromEntries(loaded.map((entry) => [entry.assetId, entry.dataUrl])))
      setMissingAssets(new Set())
      setPageId(restored.pages[0].id)
      setSaveState('备份已恢复')
    } catch (error) { setSaveState(`恢复失败：${String(error)}`) }
    finally { setImporting(false) }
  }
  const recognizePageInk = async (): Promise<void> => {
    if (!page || inkRecognizing) return
    const elements = visibleHandwriting(page)
    if (!elements.length) { setSaveState('当前页没有手写笔迹'); return }
    setInkRecognizing(true)
    setSaveState('正在识别当前页手写…')
    try {
      const signature = await handwritingSignature(page)
      const text = page.recognizedInk?.signature === signature ? page.recognizedInk.text :
        await window.liftInk.recognizeInk(base64Of(await renderPng({ ...page, paper: 'blank', elements, backgroundAssetId: undefined }, {}, false)))
      setInkReading({ pageId: page.id, signature, text })
      setSaveState(text ? '请核对手写识别结果' : '没有识别出文字，可手动填写识别结果')
    } catch (error) { setSaveState(`识别失败：${String(error)}`) }
    finally { setInkRecognizing(false) }
  }
  const saveInkReading = async (): Promise<void> => {
    const history = historyRef.current
    const current = history?.current
    const target = current?.pages.find((entry) => entry.id === inkReading?.pageId)
    if (!current || !history || !target || !inkReading) return
    if (await handwritingSignature(target) !== inkReading.signature || current !== history.current) {
      setSaveState('笔迹已修改，请重新识别')
      return
    }
    publish(history.replace({ ...current, pages: current.pages.map((entry) => entry.id === target.id ? {
      ...entry, recognizedInk: { text: inkReading.text.trim(), signature: inkReading.signature }
    } : entry) }))
    setInkReading(null)
    await autosave.flush().catch(() => undefined)
  }
  const closePdfSearch = (): void => {
    setPdfSearchOpen(false)
    setPdfHit(null)
    pdfSearchButton.current?.focus()
  }
  const jumpToPdfHit = (hit: PdfHit): void => {
    setPageId(hit.pageId)
    setSelectedId(null)
    setSelectedIds([])
    setPdfHit(hit)
    window.requestAnimationFrame(() => {
      const paper = scrollRef.current?.querySelector(`[data-page="${CSS.escape(hit.pageId)}"]`)
      const target = paper?.querySelector('.editor-pdf-search-mark') ?? paper
      target?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
  }
  useEffect(() => () => pdfImportTask.current?.abort(), [])
  const pagesForImport = (current: NoteDocument): NotePage[] =>
    saveDraft && !draftPersisted.current && current.pages.length === 1 && current.pages[0].elements.length === 0 &&
      !current.pages[0].backgroundAssetId && !current.pages[0].sourcePdfId && !current.pages[0].bookmark &&
      !current.pages[0].layers?.length
      ? []
      : current.pages.filter((entry, index) => index !== current.pages.length - 1 || !isUnusedContinuation(entry))
  const promptPdfImport = (file: File): void => {
    if (!importing && !pdfImportTask.current) setPendingPdf({ file, before: 'end' })
  }
  const importPdf = async (file: File, before: string): Promise<void> => {
    if (pdfImportTask.current || importing) return
    const task = new AbortController()
    pdfImportTask.current = task
    try {
      setImporting(true)
      const existing = historyRef.current?.current
      if (!existing) throw new Error('笔记尚未打开')
      const { pages: pdfPages, sourceId, assetUrls: urls } = await preparePdf(
        file, MAX_NOTE_PAGES - pagesForImport(existing).length, setSaveState, task.signal
      )
      task.signal.throwIfAborted()
      const history = historyRef.current
      if (!history) throw new Error('笔记尚未打开')
      const current = history.current
      const pages = pagesForImport(current)
      const index = before === 'start' ? 0 : before === 'end' ? pages.length : pages.findIndex((item) => item.id === before)
      if (index < 0) throw new Error('插入位置已改变，请重新选择')
      pages.splice(index, 0, ...pdfPages)
      if (pages.length > MAX_NOTE_PAGES) throw new Error(`导入后笔记不能超过 ${MAX_NOTE_PAGES} 页`)
      const sourcePdfIds = [...new Set([
        ...(current.sourcePdfIds ?? (current.sourcePdfId ? [current.sourcePdfId] : [])),
        sourceId
      ])]
      publish(history.replace({ ...current, sourcePdfId: current.sourcePdfId ?? sourceId, sourcePdfIds, pages }))
      setAssetUrls((current) => ({ ...current, ...urls }))
      setPageId(pdfPages[0].id)
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollRef.current?.querySelector(`[data-page="${pdfPages[0].id}"]`)?.scrollIntoView({ block: 'start' })))
      setSaveState(`已导入 ${pdfPages.length} 页 PDF，可直接批注`)
    } catch (error) {
      if (!task.signal.aborted) setSaveState(`PDF 导入失败：${String(error)}`)
    }
    finally {
      pdfImportTask.current = null
      if (!task.signal.aborted) setImporting(false)
    }
  }
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const observer = new ResizeObserver(() => setAvailableWidth(scroll.clientWidth - 18))
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [dualOpen, embedded])
  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const wheel = (event: WheelEvent): void => {
      if (dragRef.current && dragRef.current.kind !== 'hand') {
        event.preventDefault()
        return
      }
      if (!(event.ctrlKey || event.metaKey) || !event.deltaY) return
      event.preventDefault()
      if (dragRef.current) return
      const paper = (event.target as Element).closest('.editor-paper')
      if (paper) {
        const bounds = paper.getBoundingClientRect()
        wheelAnchor.current = {
          paper, x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height,
          clientX: event.clientX, clientY: event.clientY
        }
      }
      setZoom((value) => Math.min(4, Math.max(0.25, Math.round(value * (event.deltaY < 0 ? 1.1 : 1 / 1.1) * 100) / 100)))
    }
    scroll.addEventListener('wheel', wheel, { passive: false })
    return () => scroll.removeEventListener('wheel', wheel)
  }, [])
  useEffect(() => {
    const anchor = wheelAnchor.current
    const scroll = scrollRef.current
    if (!anchor || !scroll) return
    wheelAnchor.current = null
    const bounds = anchor.paper.getBoundingClientRect()
    scroll.scrollLeft += bounds.left + anchor.x * bounds.width - anchor.clientX
    scroll.scrollTop += bounds.top + anchor.y * bounds.height - anchor.clientY
  }, [zoom])
  useEffect(() => {
    if (!documentReady || !requestedPageId) return
    const paper = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-page]') ?? []).find((entry) => entry.dataset.page === requestedPageId)
    if (paper) {
      setPageId(requestedPageId)
      setSelectedId(null)
      setSelectedIds([])
      paper.scrollIntoView({ block: 'start' })
    }
  }, [documentReady, requestedPageId])
  const chooseEditorTool = (next: Tool): void => {
    setTool(next)
    setSelectPdfText(false)
    setHover(null)
  }
  const fitCanvas = (targetPage: NotePage, mode: 'width' | 'page'): void => {
    const scroll = scrollRef.current
    if (!scroll) return
    const size = pageSize(targetPage)
    const fit = availableWidth > 0 && (targetPage.size || dualOpen || embedded) ? Math.min(1, Math.max(0.25, availableWidth / size.width)) : 1
    const widthRatio = Math.max(1, scroll.clientWidth - 42) / (size.width * fit)
    const heightRatio = Math.max(1, scroll.clientHeight - 42) / (size.height * fit)
    setZoom(Math.max(0.25, Math.min(4, mode === 'width' ? widthRatio : Math.min(widthRatio, heightRatio))))
  }
  const applyInitialZoom = useEffectEvent(() => {
    if (!page || !availableWidth || initialZoomApplied.current) return
    initialZoomApplied.current = true
    if (preferences.initialZoom !== 'actual') fitCanvas(page, preferences.initialZoom)
  })
  useEffect(() => { applyInitialZoom() }, [page, availableWidth])
  useEffect(() => {
    const syncFullscreen = (): void => {
      setNoteFullscreen(window.document.fullscreenElement === editorRoot.current)
    }
    window.document.addEventListener('fullscreenchange', syncFullscreen)
    return () => window.document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  const toggleNoteFullscreen = async (): Promise<void> => {
    const editor = editorRoot.current
    if (!editor || dragRef.current) return
    try {
      if (window.document.fullscreenElement === editor) await window.document.exitFullscreen()
      else await editor.requestFullscreen()
      editor.focus({ preventScroll: true })
    } catch {
      setSaveState('无法切换全屏')
    }
  }

  useEffect(() => {
    const keyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const owner = target.closest('.editor-view')
      if (event.isComposing || cropTarget || toolPanel || inkComparisonOpen || pageToDelete || pendingPdf ||
          (owner ? owner !== editorRoot.current : embedded || (focusNoteId && focusNoteId !== note.id))) return
      const exitsFullscreen = event.key === 'Escape' && window.document.fullscreenElement === editorRoot.current
      if ((event.key === 'F11' || exitsFullscreen) && !editorPrompt && !exportOpen && !capture && !excerptCrop) {
        event.preventDefault()
        if (!event.repeat) void toggleNoteFullscreen()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && !editorPrompt && !exportOpen && !capture) {
        event.preventDefault()
        if (historyRef.current) saveLatest(historyRef.current.current)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' &&
          document && !noteFullscreen && !editorPrompt && !exportOpen && !capture) {
        event.preventDefault()
        setPdfSearchOpen(true)
        const input = editorRoot.current?.querySelector<HTMLInputElement>('.editor-pdf-search input')
        input?.focus()
        input?.select()
        return
      }
      if (event.key === 'Escape' && pdfSearchOpen && !editorPrompt && !exportOpen && !capture) {
        event.preventDefault()
        closePdfSearch()
        return
      }
      if (target.closest('input,textarea,[contenteditable="true"]')) return
      if (event.code === 'Digit0' && (event.ctrlKey || event.metaKey) && page && !editorPrompt && !exportOpen && !capture) {
        event.preventDefault()
        fitCanvas(page, 'page')
        return
      }
      const shortcutTool = toolKeys[event.code]
      if (shortcutTool && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey &&
          !target.closest('select, [role="dialog"]') && !editorPrompt && !exportOpen && !capture && !dragRef.current) {
        event.preventDefault()
        chooseEditorTool(shortcutTool)
        return
      }
      if (event.code === 'Space' && !target.closest('button:focus-visible,select')) {
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
        selectedIds.length > 0 &&
        page &&
        historyRef.current
      ) {
        const editable = page.elements.filter((element) => selectedIds.includes(element.id) && canEdit(element, page))
        if (editable.length) publish(historyRef.current.changeElements(page.id, editable.map(({ id }) => ({ id, after: null }))))
        setSelectedId(null)
        setSelectedIds([])
      }
    }
    const paste = (event: ClipboardEvent): void => {
      const target = event.target as HTMLElement
      const owner = target.closest('.editor-view')
      if (cropTarget || (owner ? owner !== editorRoot.current : embedded || (focusNoteId && focusNoteId !== note.id)) || target.closest('input,textarea,[contenteditable="true"]')) return
      const [image] = clipboardImages(event.clipboardData)
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

  const pointOnPage = (event: React.PointerEvent<SVGSVGElement>, rect = event.currentTarget.getBoundingClientRect()): InkPoint => {
    const { width, height } = event.currentTarget.viewBox.baseVal
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
      pressure: event.pointerType === 'pen' ? event.pressure : 0.5
    }
  }
  const hitInk = (point: InkPoint, targetPage = page): InkElement | null => {
    for (const element of [...(targetPage?.elements ?? [])].reverse()) {
      if (
        element.kind === 'ink' && targetPage && canEdit(element, targetPage) &&
        element.points.some(
          (entry, index) =>
            distanceToSegment(point.x, point.y, element.points[index - 1] ?? entry, entry) <
              Math.max(9, element.width)
        )
      )
        return element
    }
    return null
  }
  const hitImage = (point: InkPoint, targetPage = page): ImageElement | null => {
    for (const element of [...(targetPage?.elements ?? [])].reverse()) {
      if (
        element.kind === 'image' && targetPage && canEdit(element, targetPage) &&
        point.x >= element.x &&
        point.y >= element.y &&
        point.x <= element.x + element.width &&
        point.y <= element.y + element.height
      )
        return element
    }
    return null
  }
  const hitText = (point: InkPoint, targetPage: NotePage, target: EventTarget): TextElement | undefined => {
    const textId = (target as SVGElement).closest<SVGElement>('text[data-text-id]')?.dataset.textId
    return targetPage.elements.findLast((element): element is TextElement => {
      if (element.kind !== 'text' || !canEdit(element, targetPage)) return false
      if (textId) return element.id === textId
      const bounds = elementBounds(element, pageSize(targetPage).width)
      return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y && point.y <= bounds.y + bounds.height
    })
  }
  const editText = (element: TextElement, targetPageId: string): void => {
    setSelectedId(element.id)
    setSelectedIds([element.id])
    setEditorPrompt({ kind: 'text', pageId: targetPageId, elementId: element.id })
    const normalized = element.text.replace(/\r\n/g, '\n')
    setPromptValue(normalized)
    setPromptStyles((element.styles ?? []).map((range) => ({
      ...range,
      from: range.from - (element.text.slice(0, range.from).match(/\r(?=\n)/g)?.length ?? 0),
      to: range.to - (element.text.slice(0, range.to).match(/\r(?=\n)/g)?.length ?? 0)
    })))
    setPromptSelection({ from: 0, to: 0 })
    setPromptSize(String(Math.round(element.fontSize * 10) / 10))
    setPromptColor(element.color)
    setPromptFont(element.font ?? 'sans')
    setPromptMarkdown(element.format === 'markdown')
  }
  const markPromptText = (marker: string): void => {
    const input = promptText.current
    if (!input) return
    const { selectionStart: from, selectionEnd: to, value } = input
    const selected = value.slice(from, to)
    const insertions: { at: number; token: string }[] = []
    let start = from
    if (selected) {
      for (const line of selected.split('\n')) {
        const body = /\S(?:.*\S)?/.exec(line)
        if (body) insertions.push({ at: start + body.index, token: marker }, { at: start + body.index + body[0].length, token: marker })
        start += line.length + 1
      }
    } else insertions.push({ at: from, token: marker + marker })
    let next = value, styles = promptStyles
    for (const { at, token } of insertions.reverse()) {
      next = next.slice(0, at) + token + next.slice(at)
      styles = replaceCanvasText(styles, at, at, token.length)
    }
    if (next.length > input.maxLength) return
    setPromptMarkdown(true)
    setPromptValue(next)
    setPromptStyles(styles)
    const caret = selected ? to + next.length - value.length : from + marker.length
    setPromptSelection({ from: caret, to: caret })
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(caret, caret)
    })
  }
  const changePromptStyle = (style: Pick<CanvasTextRange, 'color' | 'font'>): void => {
    const from = promptText.current?.selectionStart ?? 0
    const to = promptText.current?.selectionEnd ?? 0
    if (from < to) {
      setPromptSelection({ from, to })
      setPromptStyles((current) => styleCanvasText(current, from, to, style))
    } else {
      if (style.font) setPromptFont(style.font)
      if (style.color) setPromptColor(style.color)
    }
  }
  const promptLocalStyle = promptSelection.from < promptSelection.to
    ? promptStyles.find((range) => range.from <= promptSelection.from && range.to >= promptSelection.to)
    : undefined
  const commitPrompt = (): void => {
    if (!editorPrompt || !historyRef.current) return
    const targetPage = historyRef.current.current.pages.find((entry) => entry.id === editorPrompt.pageId)
    if (!targetPage) return
    const value = promptValue.trim()
    if (editorPrompt.kind === 'text' && value) {
      const existing = targetPage.elements.find((element): element is TextElement => element.id === editorPrompt.elementId && element.kind === 'text')
      const point = editorPrompt.point
      const fontSize = Math.max(8, Math.min(160, Number(promptSize) || textSize))
      const style = { text: promptValue, fontSize, font: promptFont, color: promptColor, styles: promptStyles.length ? promptStyles : undefined, format: promptMarkdown ? 'markdown' as const : undefined }
      const element: TextElement | null = existing && canEdit(existing, targetPage)
        ? { ...existing, ...style, y: existing.y + fontSize - existing.fontSize }
        : point && !editorPrompt.elementId
          ? { kind: 'text', id: crypto.randomUUID(), x: point.x, y: point.y + fontSize, width: 24, ...style, layerId: activeLayer.id }
          : null
      if (element && plainCanvasText(element).trim()) {
        if (!existing) {
          const size = pageSize(targetPage)
          element.x = Math.max(0, Math.min(element.x, size.width - 32))
          element.y = Math.min(element.y, Math.max(fontSize, size.height - fontSize * 0.5))
          element.width = Math.min(360, size.width - element.x, Math.max(220, measureCanvasText(element)))
        }
        setTextSize(fontSize)
        publish(historyRef.current.changeElements(targetPage.id, [{ id: element.id, after: element }]))
        setSelectedId(element.id)
        setSelectedIds([element.id])
        setTool('select')
      }
    } else if (editorPrompt.kind === 'layer' && value) {
      const id = crypto.randomUUID()
      publish(historyRef.current.updatePage(targetPage.id, { layers: [...(targetPage.layers ?? [{ id: 'base', name: '内容', visible: true, locked: false }]), { id, name: value.slice(0, 100), visible: true, locked: false }] }))
      setActiveLayerId(id)
    } else if (editorPrompt.kind === 'bookmark') publish(historyRef.current.updatePage(targetPage.id, { bookmark: value.slice(0, 200) }))
    setEditorPrompt(null)
    setPromptValue('')
  }
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    const targetPage = historyRef.current?.current.pages.find((entry) => entry.id === event.currentTarget.dataset.pageId)
    const pen = event.pointerType === 'pen'
    const side = pen && ((event.buttons & 2) !== 0 || (event.buttons & 32) !== 0)
    const mapped = side && preferences.sideButton !== 'none' ? preferences.sideButton : null
    const drawingTool = mapped === 'erase' ? 'eraser' : mapped || tool
    if (
      !targetPage ||
      !historyRef.current ||
      dragRef.current ||
      (event.button !== 0 && !mapped) ||
      (pen && !(event.buttons & 1) && !(event.buttons & 32) && !mapped) ||
      (event.pointerType === 'touch' && preferences.ignoreTouch) ||
      (preferences.device === 'pen' && !pen)
    )
      return
    if (targetPage.id !== pageId) { setSelectedIds([]); setSelectedId(null) }
    setPageId(targetPage.id)
    const startsInk = (drawingTool === 'pen' || drawingTool === 'highlighter') && !keysRef.current.space
    const scroll = scrollRef.current
    if (startsInk && scroll) scroll.scrollTo({ left: scroll.scrollLeft, top: scroll.scrollTop, behavior: 'instant' })
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = pointOnPage(event, bounds)
    setHover(null)
    if (keysRef.current.alt) {
      const hit = hitInk(point, targetPage)
      if (hit) {
        if (drawingTool === 'highlighter') setHighlightColor(hit.color)
        else setInkColor(hit.color)
      }
      return
    }
    const objectId = (event.target as SVGElement).closest<SVGGElement>('[data-object-id]')?.dataset.objectId
    const pointedObject = targetPage.elements.find((element) => element.id === objectId && canEdit(element, targetPage))
    if (drawingTool === 'text' && !keysRef.current.space) {
      const text = hitText(point, targetPage, event.target)
      if (text) { editText(text, targetPage.id); return }
    }
    if ((drawingTool === 'pen' || drawingTool === 'highlighter' || drawingTool === 'text' || drawingTool === 'shape' || drawingTool === 'tape') && (!activeLayer.visible || activeLayer.locked)) { setSaveState('当前图层已隐藏或锁定'); return }
    if (drawingTool === 'text' && !keysRef.current.space) {
      setEditorPrompt({ kind: 'text', pageId: targetPage.id, point })
      setPromptSize(String(textSize))
      setPromptColor(inkColor)
      setPromptFont('sans')
      setPromptMarkdown(true)
      setPromptValue('')
      setPromptStyles([])
      setPromptSelection({ from: 0, to: 0 })
      return
    }
    if (drawingTool === 'tape' && !keysRef.current.space) {
      const existing = targetPage.elements.find((element) => element.kind === 'tape' && canEdit(element, targetPage) && point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height)
      if (existing?.kind === 'tape') {
        publish(historyRef.current.changeElements(targetPage.id, [{ id: existing.id, after: { ...existing, revealed: !existing.revealed } }]))
        return
      }
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
    } else if (drawingTool === 'pen' || drawingTool === 'highlighter') {
      const canvas = event.currentTarget
      const matrix = canvas.getScreenCTM()
      const previewLayer = canvas.querySelector(`[data-live-ink="${drawingTool}"]`)
      if (!matrix || !previewLayer) return
      const stylus = pen && preferences.device !== 'mouse'
      const brush: Brush = drawingTool === 'highlighter'
        ? { brush: drawingTool, color: highlightColor, width: highlightWidth, pressureSensitive: false, stability: 0.35, inkVersion: 2 }
        : { brush: drawingTool, color: inkColor, width: penWidth, pressureSensitive: penPressure, penStyle, stability, pressureCurve, inkVersion: 3, pressureInput: stylus ? 'pen' : 'fixed' }
      const inverse = matrix.inverse()
      const first = readInkSample(event.nativeEvent, inverse, stylus)
      const screenScale = Math.hypot(matrix.a, matrix.b)
      const input = new InkInput(first, screenScale, brush.stability ?? 0, stylus)
      const preview = window.document.createElementNS('http://www.w3.org/2000/svg', 'path')
      preview.setAttribute('fill', brush.color)
      preview.setAttribute('opacity', String(inkOpacity(brush)))
      preview.setAttribute('d', strokePath(input.preview(), brush))
      if (drawingTool === 'highlighter' && multiplyHighlighter(targetPage)) preview.style.mixBlendMode = 'multiply'
      previewLayer.appendChild(preview)
      dragRef.current = {
        kind: 'ink', id: event.pointerId, pageId: targetPage.id, input,
        brush, stylus, layerId: activeLayer.id, inverse, preview, screenScale,
        trace: drawingTool === 'pen' ? { version: 1, samples: [first], screenScale, stylus, brush } : undefined
      }
    } else if (drawingTool === 'eraser') {
      const candidates = targetPage.elements.flatMap((stroke) => stroke.kind === 'ink' && canEdit(stroke, targetPage) ? [{ stroke, bounds: elementBounds(stroke) }] : [])
      const drag: EraseDrag = { kind: 'erase', id: event.pointerId, pageId: targetPage.id, previous: point, radius: eraserDiameterFor(targetPage) / 2, fragments: new Map(), candidates }
      dragRef.current = drag
      eraseAt(drag, point)
      setHover({ pageId: targetPage.id, point })
    } else if (drawingTool === 'select') {
      event.preventDefault()
      const resizing = targetPage.id === pageId && (event.target as SVGElement).dataset.handle === 'resize'
      const resizable = selectedText ?? selectedTape ?? selectedShape
      if (resizing && resizable) {
        dragRef.current = { kind: 'resize', id: event.pointerId, pageId: targetPage.id, start: point, original: resizable, latest: resizable, edge: (event.target as SVGElement).dataset.resizeEdge }
        return
      }
      const text = hitText(point, targetPage, event.target)
      const image = (resizing ? selectedImage : null) ?? hitImage(point, targetPage)
      const clickedText = !resizing && (event.target as SVGElement).closest('text[data-text-id]')
      const tapeId = (event.target as SVGElement).closest<SVGElement>('[data-tape-id]')?.dataset.tapeId
      const tape = tapeId && targetPage.elements.find((element) => element.id === tapeId && canEdit(element, targetPage))
      const shape = targetPage.elements.findLast((element) => {
        if (element.kind !== 'shape' || !canEdit(element, targetPage)) return false
        if (element.shape === 'line') return distanceToSegment(point.x, point.y, { ...point, x: element.x, y: element.y },
          { ...point, x: element.x + element.width, y: element.y + element.height }) <= Math.max(6, element.strokeWidth)
        const bounds = elementBounds(element)
        return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height
      })
      const hit = (resizing ? image : pointedObject ?? (tape || (clickedText ? text : shape ?? image ?? text))) ?? hitInk(point, targetPage)
      const priorIds = targetPage.id === pageId ? selectedIds : []
      const selectedHit = targetPage.elements.find((element) => {
        if (!priorIds.includes(element.id) || !canEdit(element, targetPage)) return false
        const bounds = elementBounds(element, pageSize(targetPage).width)
        return point.x >= bounds.x - 7 && point.x <= bounds.x + bounds.width + 7 && point.y >= bounds.y - 7 && point.y <= bounds.y + bounds.height + 7
      })
      if ((hit ? priorIds.includes(hit.id) : selectedHit) && !resizing) {
        dragRef.current = { kind: 'selection', id: event.pointerId, pageId: targetPage.id, start: point, ids: priorIds }
        return
      }
      setSelectedId(hit?.id ?? null)
      setSelectedIds(hit ? [hit.id] : [])
      if (hit?.kind === 'image' && resizing)
        dragRef.current = {
          kind: 'image',
          id: event.pointerId,
          pageId: targetPage.id,
          original: hit,
          start: point,
          latest: hit,
          resize: resizing
        }
      else if (hit) {
        dragRef.current = { kind: 'selection', id: event.pointerId, pageId: targetPage.id, start: point, ids: [hit.id] }
      } else {
        dragRef.current = { kind: 'lasso', id: event.pointerId, pageId: targetPage.id, points: [point] }
        setLassoPoints([point])
      }
    } else if (drawingTool === 'shape' || drawingTool === 'tape') {
      dragRef.current = { kind: 'shape', id: event.pointerId, pageId: targetPage.id, start: point, current: point, tool: drawingTool }
      setShapePreview(dragRef.current)
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
  const updateHover = (event: React.PointerEvent<SVGSVGElement>): void => {
    const pageId = event.currentTarget.dataset.pageId
    setHover(pageId && (tool === 'eraser' || ((tool === 'pen' || tool === 'highlighter') && event.buttons === 0))
      ? { pageId, point: pointOnPage(event) }
      : null)
  }
  const eraseAt = (drag: EraseDrag, point: InkPoint): void => {
    const { previous, radius } = drag
    const left = Math.min(previous.x, point.x) - radius
    const top = Math.min(previous.y, point.y) - radius
    const right = Math.max(previous.x, point.x) + radius
    const bottom = Math.max(previous.y, point.y) + radius
    let changed = false
    for (const { stroke, bounds } of drag.candidates) {
      if (bounds.x > right || bounds.y > bottom || bounds.x + bounds.width < left || bounds.y + bounds.height < top) continue
      const previousPieces = drag.fragments.get(stroke.id) ?? [stroke]
      if (!previousPieces.length) continue
      const farX = Math.max(Math.abs(bounds.x - point.x), Math.abs(bounds.x + bounds.width - point.x))
      const farY = Math.max(Math.abs(bounds.y - point.y), Math.abs(bounds.y + bounds.height - point.y))
      const pieces = Math.hypot(farX, farY) <= radius
        ? []
        : previousPieces.flatMap((piece) => splitInk(piece, [previous, point], radius))
      if (pieces.length !== previousPieces.length || pieces.some((piece, index) => piece !== previousPieces[index])) {
        changed = true
        drag.fragments.set(stroke.id, pieces)
      }
    }
    drag.previous = point
    if (changed) setErasedFragments(new Map(drag.fragments))
  }
  const commitInk = (drag: InkDrag, points: InkPoint[]): void => {
    const history = historyRef.current
    if (!history?.current.pages.some((entry) => entry.id === drag.pageId) || !isMeaningfulInk(points, drag.stylus)) return
    const stroke: InkElement = {
      kind: 'ink', id: crypto.randomUUID(), ...drag.brush, points,
      layerId: drag.layerId
    }
    publish(history.changeElements(drag.pageId, [{ id: stroke.id, after: stroke }]), true)
  }
  const finishInk = (drag: InkDrag, release?: InkSample, cancelled = false): void => {
    if (drag.trace && release) drag.trace.release = release
    if (drag.trace && drag.straightened) drag.trace.straightened = true
    if (drag.brush.brush === 'pen') lastInkTrace.current = drag.trace ?? null
    const rawPoints = drag.input.finish(release)
    const points = drag.straightened ? straightLinePoints(rawPoints) : rawPoints
    if (!cancelled || points.length > 1) commitInk(drag, points)
  }
  const clearPointerPreview = (): void => {
    if (dragRef.current?.kind === 'ink') {
      window.clearTimeout(dragRef.current.holdTimer)
      dragRef.current.preview.remove()
    }
    dragRef.current = null
    window.cancelAnimationFrame(inkFrame.current)
    inkFrame.current = 0
    window.cancelAnimationFrame(dragScrollFrame.current)
    dragScrollFrame.current = 0
    setErasedFragments(null)
    setPreviewImage(null)
    setResizePreview(null)
    setLassoPoints([])
    setDragPreview({ dx: 0, dy: 0 })
    setPageTransfer(null)
    setCompanionDropPage(undefined)
    setShapePreview(null)
  }
  const selectionMove = (drag: Extract<Drag, { kind: 'selection' }>, clientX: number, clientY: number, source: SVGSVGElement): {
    dx: number; dy: number; transfer: typeof pageTransfer; outside: boolean; transferable: boolean
    companion?: { pageId: string; images: ImageElement[]; canvas: SVGSVGElement }
  } => {
    const pages = historyRef.current?.current.pages ?? []
    const from = pages.find((entry) => entry.id === drag.pageId)
    const objects = from?.elements.filter((element) => drag.ids.includes(element.id)) ?? []
    const transferable = objects.length > 0 && objects.every((element) => element.kind === 'image' || element.kind === 'text')
    const bounds = source.getBoundingClientRect()
    const dx = (clientX - bounds.left) / bounds.width * source.viewBox.baseVal.width - drag.start.x
    const dy = (clientY - bounds.top) / bounds.height * source.viewBox.baseVal.height - drag.start.y
    const hovered = window.document.elementFromPoint(clientX, clientY)
    const paper = hovered?.closest('.editor-paper')
    const reference = hovered?.closest<SVGSVGElement>('svg[data-reference-page]')
    const overCompanion = hovered && companionPanel.current?.contains(hovered)
    const sameNoteReference = overCompanion && reference && objects.every((element) => element.kind === 'image') ? reference : null
    const dest = sameNoteReference ??
      (paper && scrollRef.current?.contains(paper) ? paper.querySelector<SVGSVGElement>('svg[data-page-id]') : null)
    const to = pages.find((entry) => entry.id === (dest?.dataset.referencePage ?? dest?.dataset.pageId))
    if (overCompanion && companionImageDrop.current && objects.length &&
        objects.every((element): element is ImageElement => element.kind === 'image') &&
        !historyRef.current?.current.excerpts?.some((entry) => drag.ids.includes(entry.elementId))) {
      const right = paper?.querySelector<SVGSVGElement>('svg[data-page-id]')
      const pageId = right?.dataset.pageId
      const matrix = right?.getScreenCTM()
      if (right && pageId && matrix) {
        const anchor = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
        const { width, height } = right.viewBox.baseVal
        const images = objects.map((image) => {
          const scale = Math.min(1, width / image.width, height / image.height)
          const w = image.width * scale
          const h = image.height * scale
          return { ...image, width: w, height: h,
            x: Math.max(0, Math.min(width - w, anchor.x + (image.x - drag.start.x) * scale)),
            y: Math.max(0, Math.min(height - h, anchor.y + (image.y - drag.start.y) * scale)) }
        })
        return { dx, dy, transfer: null, outside: true, transferable, companion: { pageId, images, canvas: right } }
      }
    }
    let transfer: typeof pageTransfer = null
    if (from && dest && to && to.id !== from.id && transferable) {
      const rect = dest.getBoundingClientRect()
      const { width, height } = pageSize(to)
      const matrix = sameNoteReference?.getScreenCTM()
      const anchor = matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null
      const targetX = anchor?.x ?? (clientX - rect.left) / rect.width * width
      const targetY = anchor?.y ?? (clientY - rect.top) / rect.height * height
      if (sameNoteReference && (targetX < 0 || targetX > width || targetY < 0 || targetY > height))
        return { dx, dy, transfer: null, outside: true, transferable }
      const moved = objects.flatMap((element) => {
        const layerId = element.layerId ?? 'base'
        const unlocked = to.layers?.filter((layer) => layer.visible && !layer.locked)
        const layer = unlocked?.find((layer) => layer.id === layerId) ?? unlocked?.find((layer) => layer.id === 'base') ?? unlocked?.[0]
        if (to.layers?.length && !layer) return []
        const dx = targetX - drag.start.x, dy = targetY - drag.start.y
        const after = element.kind === 'text' ? positionCanvasText(element, pageSize(from).width, { width, height }, dx, dy) : moveElement(element, dx, dy)
        if (after.kind === 'image') {
          after.x = Math.max(0, Math.min(width - Math.min(24, after.width), after.x))
          after.y = Math.max(0, Math.min(height - Math.min(24, after.height), after.y))
        }
        return [{ ...after, layerId: layer?.id ?? 'base' }]
      })
      if (moved.length === objects.length) transfer = { from: from.id, to: to.id, objects: moved, reference: !!sameNoteReference }
    }
    return { dx, dy, transfer, outside: dest !== source, transferable }
  }
  const previewSelectionMove = (drag: Extract<Drag, { kind: 'selection' }>, x: number, y: number, source: SVGSVGElement): boolean => {
    const { dx, dy, transfer, transferable, outside, companion } = selectionMove(drag, x, y, source)
    setPageTransfer(transfer)
    setCompanionDropPage(companion?.pageId)
    setDragPreview(transfer || (transferable && outside) ? { dx: 0, dy: 0 } : { dx, dy })
    return transferable
  }
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) {
      updateHover(event)
      return
    }
    if (drag.kind === 'hand') {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = drag.left - event.clientX + drag.x
        scrollRef.current.scrollTop = drag.top - event.clientY + drag.y
      }
    } else if (drag.kind === 'ink') {
      if (event.buttons === 0 && !drag.stylus) {
        finishInk(drag)
        clearPointerPreview()
        updateHover(event)
        return
      }
      const entries = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent]
      for (const entry of entries.length ? entries : [event.nativeEvent]) {
        if (drag.stylus && entry.pressure === 0 && entry.buttons === 0) continue
        const sample = readInkSample(entry, drag.inverse, drag.stylus)
        if (drag.trace) {
          if (drag.trace.samples.length < maxTraceSamples) drag.trace.samples.push(sample)
          else drag.trace = undefined
        }
        drag.input.add(sample)
      }
      const points = drag.input.preview()
      const first = points[0]
      const last = points.at(-1)!
      const length = Math.hypot(last.x - first.x, last.y - first.y) * drag.screenScale
      if (!drag.straightened && length >= 12 &&
          (!drag.holdAnchor || Math.hypot(last.x - drag.holdAnchor.x, last.y - drag.holdAnchor.y) * drag.screenScale >= 2)) {
        window.clearTimeout(drag.holdTimer)
        drag.holdAnchor = last
        drag.holdTimer = window.setTimeout(() => {
          if (dragRef.current !== drag) return
          drag.straightened = true
          drag.preview.setAttribute('d', strokePath(straightLinePoints(drag.input.preview()), drag.brush))
        }, 2000)
      }
      if (!inkFrame.current) {
        inkFrame.current = window.requestAnimationFrame(() => {
          inkFrame.current = 0
          if (dragRef.current === drag) drag.preview.setAttribute('d', strokePath(drag.straightened ? straightLinePoints(drag.input.preview()) : drag.input.preview(), drag.brush))
        })
      }
    } else if (drag.kind === 'erase') {
      const point = pointOnPage(event)
      eraseAt(drag, point)
      setHover({ pageId: drag.pageId, point })
    } else if (drag.kind === 'lasso') {
      drag.points.push(pointOnPage(event))
      setLassoPoints([...drag.points])
    } else if (drag.kind === 'selection') {
      const { clientX, clientY, currentTarget } = event
      window.cancelAnimationFrame(dragScrollFrame.current)
      const transferable = previewSelectionMove(drag, clientX, clientY, currentTarget)
      const scroll = scrollRef.current
      if (transferable && scroll) {
        const bounds = scroll.getBoundingClientRect()
        const speed = clientY < bounds.top + 48 ? -Math.min(22, (bounds.top + 48 - clientY) / 3) :
          clientY > bounds.bottom - 48 ? Math.min(22, (clientY - bounds.bottom + 48) / 3) : 0
        const scrollStep = (): void => {
          if (dragRef.current !== drag) return
          const previous = scroll.scrollTop
          scroll.scrollTop += speed
          if (previous === scroll.scrollTop) return
          previewSelectionMove(drag, clientX, clientY, currentTarget)
          dragScrollFrame.current = requestAnimationFrame(scrollStep)
        }
        if (speed && clientX >= bounds.left && clientX <= bounds.right) dragScrollFrame.current = requestAnimationFrame(scrollStep)
      }
    } else if (drag.kind === 'shape') {
      drag.current = pointOnPage(event)
      setShapePreview({ ...drag })
    } else if (drag.kind === 'resize') {
      const point = pointOnPage(event)
      const original = drag.original
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      if (original.kind === 'text') {
        const resizePage = historyRef.current?.current.pages.find((entry) => entry.id === drag.pageId)
        const bounds = elementBounds(original, resizePage ? pageSize(resizePage).width : undefined)
        const edge = drag.edge ?? 'se'
        const maxWidth = edge.includes('w') ? Math.min(20000, bounds.x + bounds.width) : 20000
        const maxHeight = edge.includes('n') ? Math.min(20000, bounds.y + bounds.height) : 20000
        const width = /[ew]/.test(edge) ? Math.max(24, Math.min(maxWidth, bounds.width + (edge.includes('w') ? -dx : dx))) : bounds.width
        const height = /[ns]/.test(edge) ? Math.max(original.fontSize * 1.25, Math.min(maxHeight, bounds.height + (edge.includes('n') ? -dy : dy))) : bounds.height
        drag.latest = { ...original, width, height,
          x: edge.includes('w') ? bounds.x + bounds.width - width : bounds.x,
          y: edge.includes('n') ? original.y + bounds.height - height : original.y }
      } else if (original.kind === 'shape' && original.shape === 'line') {
        drag.latest = { ...original, width: original.width + dx, height: original.height + dy }
      } else {
        drag.latest = { ...original, width: Math.max(8, original.width + dx), height: Math.max(8, original.height + dy) }
      }
      setResizePreview(drag.latest)
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
    if (!drag || drag.id !== event.pointerId || !historyRef.current) return
    const targetPage = historyRef.current.current.pages.find((entry) => entry.id === (drag.kind === 'hand' ? pageId : drag.pageId))
    if (!targetPage) { clearPointerPreview(); return }
    if (drag.kind === 'ink') {
      finishInk(drag, readInkSample(event.nativeEvent, drag.inverse, drag.stylus))
    } else if (drag.kind === 'erase') {
      eraseAt(drag, pointOnPage(event))
      if (drag.fragments.size) publish(historyRef.current.updatePage(targetPage.id, {
        elements: targetPage.elements.flatMap<PageElement>((element) => drag.fragments.get(element.id) ?? [element])
      }), true)
    } else if (drag.kind === 'lasso') {
      if (drag.points.length > 2) {
        const ids = targetPage.elements.filter((element) => {
          if (!canEdit(element, targetPage)) return false
          const bounds = elementBounds(element, pageSize(targetPage).width)
          return insidePolygon({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, pressure: 0.5 }, drag.points)
        }).map((element) => element.id)
        setSelectedIds(ids)
        setSelectedId(ids.length === 1 ? ids[0] : null)
      }
    } else if (drag.kind === 'selection') {
      const { dx, dy, transfer, outside, transferable, companion } = selectionMove(drag, event.clientX, event.clientY, event.currentTarget)
      const destination = historyRef.current.current.pages.find((entry) => entry.id === transfer?.to)
      if (companion && !imageMoveSaving.current) {
        const history = historyRef.current
        const sources = targetPage.elements.filter((element) => drag.ids.includes(element.id))
        imageMoveSaving.current = true
        void (async () => {
          try {
            const urls = Object.fromEntries(await Promise.all(companion.images.map(async (image) => [
              image.assetId, assetUrls[image.assetId] ?? (await window.liftInk.loadImage(image.assetId)).dataUrl
            ] as const)))
            const drop = companionImageDrop.current
            if (!drop || !companion.canvas.isConnected) throw new Error('右侧笔记已切换')
            await drop(companion.pageId, companion.images, urls)
            const latest = history.current.pages.find((entry) => entry.id === targetPage.id)
            if (!editorRoot.current || !latest || !sources.every((element) => latest.elements.includes(element))) return
            publish(history.changeElements(targetPage.id, sources.map(({ id }) => ({ id, after: null }))))
            setSelectedIds([])
            setSelectedId(null)
            await autosave.flush()
          } catch (error) { setSaveState(`跨栏移动未完成：${String(error)}`) }
          finally { imageMoveSaving.current = false }
        })()
      } else if (transfer && destination) {
        publish(historyRef.current.transferObjects(targetPage, destination, transfer.objects))
        if (transfer.reference) { setSelectedIds([]); setSelectedId(null) }
        else setPageId(destination.id)
      } else if ((!transferable || !outside) && Math.hypot(dx, dy) > 0.5) {
        publish(historyRef.current.changeElements(targetPage.id, drag.ids.flatMap((id) => {
          const element = targetPage.elements.find((entry) => entry.id === id)
          if (!element) return []
          const size = pageSize(targetPage)
          const after = element.kind === 'text' ? positionCanvasText(element, size.width, size, dx, dy) : moveElement(element, dx, dy)
          return [{ id, after }]
        })))
      }
    } else if (drag.kind === 'shape') {
      const x = Math.min(drag.start.x, drag.current.x), y = Math.min(drag.start.y, drag.current.y)
      const width = Math.max(8, Math.abs(drag.current.x - drag.start.x)), height = Math.max(8, Math.abs(drag.current.y - drag.start.y))
      const element: ShapeElement | TapeElement = drag.tool === 'tape'
        ? { kind: 'tape', id: crypto.randomUUID(), x, y, width, height, revealed: false, layerId: activeLayer.id }
        : { kind: 'shape', id: crypto.randomUUID(), x: shapePreset === 'line' ? drag.start.x : x, y: shapePreset === 'line' ? drag.start.y : y,
          width: shapePreset === 'line' ? drag.current.x - drag.start.x : width, height: shapePreset === 'line' ? drag.current.y - drag.start.y : height,
          shape: shapePreset, color: inkColor, strokeWidth: 2, layerId: activeLayer.id }
      publish(historyRef.current.changeElements(targetPage.id, [{ id: element.id, after: element }]))
    } else if (drag.kind === 'resize' && drag.original !== drag.latest) {
      publish(historyRef.current.changeElements(targetPage.id, [{ id: drag.original.id, after: drag.latest }]))
    } else if (
      drag.kind === 'image' &&
      (drag.latest.x !== drag.original.x ||
        drag.latest.y !== drag.original.y ||
        drag.latest.width !== drag.original.width ||
        drag.latest.height !== drag.original.height)
    ) {
      publish(
        historyRef.current.changeElements(targetPage.id, [{ id: drag.original.id, after: drag.latest }])
      )
    }
    clearPointerPreview()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const pointerCancel = (event: React.PointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    if (drag.kind === 'ink') finishInk(drag, undefined, true)
    clearPointerPreview()
    setHover(null)
  }
  const editCanvasText = (event: React.MouseEvent<SVGSVGElement>): void => {
    if (!document || tool !== 'select') return
    const targetPage = document.pages.find((entry) => entry.id === event.currentTarget.dataset.pageId)
    if (!targetPage) return
    const rect = event.currentTarget.getBoundingClientRect()
    const { width, height } = event.currentTarget.viewBox.baseVal
    const point = { x: ((event.clientX - rect.left) / rect.width) * width, y: ((event.clientY - rect.top) / rect.height) * height, pressure: 0.5 }
    const text = hitText(point, targetPage, event.target)
    if (text) editText(text, targetPage.id)
  }
  const transformSelection = (action: 'copy' | 'smaller' | 'larger' | 'delete'): void => {
    if (!page || !historyRef.current || !selectedIds.length) return
    const selected = page.elements.filter((element) => selectedIds.includes(element.id) && canEdit(element, page))
    if (!selected.length) return
    if (action === 'delete') {
      publish(historyRef.current.changeElements(page.id, selected.map((element) => ({ id: element.id, after: null }))))
      setSelectedIds([])
      setSelectedId(null)
    } else if (action === 'copy') {
      const copies = selected.map((element) => ({ ...moveElement(element, 24, 24), id: crypto.randomUUID() }))
      publish(historyRef.current.changeElements(page.id, copies.map((element) => ({ id: element.id, after: element }))))
      setSelectedIds(copies.map((element) => element.id))
      setSelectedId(null)
    } else {
      const bounds = selected.map(elementBounds)
      const origin = { x: Math.min(...bounds.map((item) => item.x)), y: Math.min(...bounds.map((item) => item.y)), pressure: 0.5 }
      const scale = action === 'larger' ? 1.1 : 1 / 1.1
      publish(historyRef.current.changeElements(page.id, selected.map((element) => ({ id: element.id, after: scaleElement(element, origin, scale) }))))
    }
  }
  const addExcerpt = (targetPageId: string, element: PageElement, sourceNoteId: string, sourcePageId: string): void => {
    const history = historyRef.current
    const current = history?.current
    if (!history || !current?.pages.some((entry) => entry.id === targetPageId)) throw new Error('目标页已不存在')
    publish(history.replace({ ...current, pages: current.pages.map((entry) => entry.id === targetPageId
      ? { ...entry, elements: [...entry.elements, element] } : entry),
      excerpts: [...(current.excerpts ?? []), { id: crypto.randomUUID(), pageId: targetPageId, elementId: element.id, sourceNoteId, sourcePageId }] }))
    setSelectedId(element.id)
    setSelectedIds([element.id])
    setSaveState('已摘录，点击内容后可返回来源')
  }
  const insertExcerptImage = async (url: string, targetPageId: string, sourceNoteId: string, sourcePageId: string, layerId: string): Promise<void> => {
    const target = historyRef.current?.current.pages.find((entry) => entry.id === targetPageId)
    if (!target) throw new Error('目标页已不存在')
    const sourceSize = await imageDimensions(url)
    const targetSize = pageSize(target)
    const scale = Math.min(targetSize.width * 0.65 / sourceSize.width, targetSize.height * 0.65 / sourceSize.height)
    const image = await window.liftInk.storeImage('image/png', url.split(',')[1])
    addExcerpt(targetPageId, { kind: 'image', id: crypto.randomUUID(), assetId: image.assetId,
      x: targetSize.width * 0.12, y: targetSize.height * 0.12, width: sourceSize.width * scale, height: sourceSize.height * scale, layerId }, sourceNoteId, sourcePageId)
    setAssetUrls((current) => ({ ...current, [image.assetId]: image.dataUrl }))
  }
  const excerptDualPage = async (region = false): Promise<void> => {
    if (!page || !historyRef.current || !activeLayer) return
    try {
      const companion = otherNotes.find((entry) => entry.id === dualNoteId)
      if (companion?.workspace || companion?.kind === 'markdown') {
        await flushEditorSaves()
        const content = companion.workspace
          ? draftText(companion.draft)
          : richNodes((await window.liftInk.loadDocument(dualNoteId)).value?.richText).flatMap((item) => item.text ? [item.text] : [])
        const text = content.join(' ').trim().slice(0, 500)
        if (!text) throw new Error('来源笔记没有可摘录的正文，请先保存')
        const target = pageSize(page)
        const width = Math.min(560, target.width * 0.76)
        const maxCharacters = Math.max(12, Math.floor(width / 19))
        const lines = Array.from(text)
        const wrapped = Array.from({ length: Math.ceil(lines.length / maxCharacters) }, (_, index) =>
          lines.slice(index * maxCharacters, (index + 1) * maxCharacters).join('')).join('\n')
        addExcerpt(page.id, { kind: 'text', id: crypto.randomUUID(), x: target.width * 0.12, y: target.height * 0.12,
          width, fontSize: 18, color: '#252638', text: wrapped, layerId: activeLayer.id }, dualNoteId, 'document')
        return
      }
      const source = dualNoteId === note.id ? document : (await window.liftInk.loadDocument(dualNoteId)).value
      const sourcePage = source?.pages.find((entry) => entry.id === dualPageId) ?? source?.pages[0]
      if (!sourcePage) throw new Error('来源页面已不存在')
      setSaveState('正在摘录页面…')
      const ids = new Set([sourcePage.backgroundAssetId, ...sourcePage.elements.flatMap((entry) => entry.kind === 'image' ? [entry.assetId] : [])])
      const sourceAssets = Object.fromEntries(await Promise.all([...ids].flatMap((id) => id ? [window.liftInk.loadImage(id).then(({ dataUrl }) => [id, dataUrl])] : [])))
      const url = `data:image/png;base64,${base64Of(await renderPng(sourcePage, sourceAssets, true))}`
      if (region) { setSaveState('框选要摘录的区域'); setExcerptCrop({ url, targetPageId: page.id, sourceNoteId: dualNoteId, sourcePageId: sourcePage.id, layerId: activeLayer.id }) }
      else await insertExcerptImage(url, page.id, dualNoteId, sourcePage.id, activeLayer.id)
    } catch (error) { setSaveState(`摘录失败：${String(error)}`) }
  }
  const renderElement = (element: PageElement, multiply: boolean, pageWidth: number): React.JSX.Element | null => {
    if (element.kind === 'ink') {
      let path = cachedPaths.current.get(element)
      if (path === undefined) {
        path = strokePath(element.points, element)
        cachedPaths.current.set(element, path)
      }
      return (
        <path
          key={element.id}
          d={path}
          fill={element.color}
          opacity={inkOpacity(element)}
          style={multiply && isHighlighter(element) ? { mixBlendMode: 'multiply' } : undefined}

          strokeWidth="2"

        />
      )
    }
    if (element.kind === 'text') {
      const layout = layoutCanvasText(element, pageWidth)
      const clip = `${textClipPrefix}-${element.id}`
      const top = element.y - element.fontSize
      return (
        <g>
          <defs><clipPath id={clip}><rect x={layout.x} y={top} width={layout.width} height={layout.height} /></clipPath></defs>
          <rect data-text-box-hit="" x={layout.x} y={top} width={layout.width} height={layout.height} fill="transparent" pointerEvents={tool === 'select' || tool === 'text' ? 'all' : 'none'} />
          <text data-text-id={element.id} x={layout.x} y={element.y} fill={element.color} fontSize={element.fontSize} xmlSpace="preserve" pointerEvents="bounding-box" clipPath={`url(#${clip})`}>
            {layout.lines.map((line, index) => <tspan key={index} x={layout.x} y={element.y + index * element.fontSize * 1.5}>
              {line.map((run, i) => <tspan key={i} fill={run.color} style={canvasTextStyle(run, element.font)}>{run.text}</tspan>)}
            </tspan>)}
          </text>
        </g>
      )
    }
    if (element.kind === 'shape') return element.shape === 'rect'
      ? <rect key={element.id} x={element.x} y={element.y} width={element.width} height={element.height} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} />
      : element.shape === 'ellipse'
        ? <ellipse key={element.id} cx={element.x + element.width / 2} cy={element.y + element.height / 2} rx={Math.abs(element.width / 2)} ry={Math.abs(element.height / 2)} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} />
        : <path key={element.id} d={`M${element.x} ${element.y}L${element.x + element.width} ${element.y + element.height}`} stroke={element.color} strokeWidth={element.strokeWidth} />
    if (element.kind === 'tape') return <rect key={element.id} data-tape-id={element.id} x={element.x} y={element.y} width={element.width} height={element.height} rx="5" fill={element.revealed ? '#d9cee944' : '#d9cee9'} stroke="#ae9bc9" strokeDasharray={element.revealed ? '5 4' : undefined} />
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
  const renderCanvasElements = (canvasPage: NotePage, band: ReturnType<typeof pagePaintBand>, multiply = false): React.JSX.Element[] => {
    const size = pageSize(canvasPage)
    const incoming = pageTransfer?.to === canvasPage.id && !pageTransfer.reference ? pageTransfer.objects : []
    return [...canvasPage.elements, ...incoming].filter((element) => pagePaintBand(element) === band && isVisible(element, canvasPage)
      && !(pageTransfer?.from === canvasPage.id && selectedIds.includes(element.id))).map((element) => {
      const current = canvasPage.id === pageId
      const fragments = current ? erasedFragments?.get(element.id) : undefined
      const shown = current && resizePreview?.id === element.id ? resizePreview : element
      const moving = current && selectedIds.includes(element.id) && (dragPreview.dx !== 0 || dragPreview.dy !== 0)
      const position = moving && shown.kind === 'text' ? positionCanvasText(shown, size.width, size, dragPreview.dx, dragPreview.dy) : null
      const dx = position && shown.kind === 'text' ? position.x - shown.x : dragPreview.dx
      const dy = position && shown.kind === 'text' ? position.y - shown.y : dragPreview.dy
      return <g key={element.id} data-object-id={element.kind === 'ink' ? undefined : element.id} transform={moving ? `translate(${dx} ${dy})` : undefined}>
        {fragments ? fragments.map((fragment) => renderElement(fragment, multiply, size.width)) : renderElement(shown, multiply, size.width)}
      </g>
    })
  }
  const openToolPanel = (kind: ToolPanel, anchor: HTMLButtonElement): void => {
    setToolPanel((current) => current?.kind === kind ? null : { kind, anchor })
  }
  const chooseToolOption = (): void => {
    toolPanel?.anchor.focus()
    setToolPanel(null)
  }
  const closeDual = (): void => {
    setDualOpen(false)
    onActivate?.(note.id)
  }
  const rightNote = otherNotes.find((entry) => entry.id === dualNoteId)
  const referencePage = dualOpen && !rightNote ?
    document?.pages.find((entry) => entry.id === dualPageId) ?? document?.pages[0] : undefined
  const referenceUrl = useMemo(() => referencePage
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSvg(referencePage, assetUrls, true))}`
    : undefined, [referencePage, assetUrls])
  const referenceSize = pageSize(referencePage ?? {})
  const referenceImages = pageTransfer?.reference && pageTransfer.to === referencePage?.id ? pageTransfer.objects : []
  const adjustSplit = (event: React.PointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
    setDualRatio(Math.max(0.3, Math.min(0.7, (bounds.right - event.clientX) / bounds.width)))
  }

  return (
    <section
      ref={editorRoot}
      className={`editor-view${embedded ? ' embedded-editor' : ''}`}
      aria-label={embedded ? '右侧笔记编辑器' : '笔记页面'}
      tabIndex={-1}
      onPointerDownCapture={(event) => {
        const target = event.target as Element
        if (target.closest('.editor-view') !== event.currentTarget) return
        onActivate?.(note.id)
        if (target.closest('.editor-live-canvas')) event.currentTarget.focus({ preventScroll: true })
      }}
      onFocusCapture={(event) => {
        if (event.target.closest('.editor-view') === event.currentTarget) onActivate?.(note.id)
      }}
    >
      <header className="editor-topbar">
        {!embedded && <EditorButton className="editor-back" aria-label="返回上一页" help="关闭当前笔记并回到文件列表。" onClick={onBack}>
          <ChevronLeft size={20} />
          <span>返回</span>
        </EditorButton>}
        <div className="editor-document">
          <input
            aria-label="笔记标题"
            value={note.title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <FolderPicker value={note.folder} folders={folders} onChange={onFolderChange} />
          {onTagsChange && onCreateTag && <NoteTagPicker tags={note.tags ?? []} catalog={tagCatalog} onChange={onTagsChange} onCreate={onCreateTag} />}
        </div>
        <div className="editor-top-actions">
          <span className="editor-save-state" aria-live="polite">
            {saveState}
          </span>
          <EditorButton className="editor-pages-toggle" aria-label="导入 PDF" help="将 PDF 加入当前笔记以便批注。" onClick={() => pdfRef.current?.click()} disabled={importing || !document}><FileUp size={17} /><span>PDF</span></EditorButton>
          <EditorButton ref={pdfSearchButton} className={`editor-pages-toggle ${pdfSearchOpen ? 'active' : ''}`} aria-label="查找 PDF 原文" help="搜索 PDF 正文（Ctrl/Cmd+F）。" aria-expanded={pdfSearchOpen} onClick={() => pdfSearchOpen ? closePdfSearch() : setPdfSearchOpen(true)} disabled={!document}><Search size={17} /></EditorButton>
          {document?.pages.some((item) => item.sourcePdfId) && <EditorButton aria-label="选择 PDF 原文" help="开启后可在可见 PDF 页面拖选文字，按 Ctrl+C 复制。扫描页识别后，可在 PDF 查找中复制 OCR 文字。" aria-pressed={selectPdfText}
            className={`editor-pages-toggle${selectPdfText ? ' active' : ''}`} onClick={() => setSelectPdfText(!selectPdfText)}><ScanText size={17} /></EditorButton>}
          <EditorButton aria-label="识别手写" help="尝试识别当前页笔迹，核对后加入搜索。" disabled={!page || inkRecognizing}
            onClick={() => void recognizePageInk()}><ScanEye size={17} /></EditorButton>
          <EditorButton className="editor-pages-toggle" aria-label="导出或备份" help="导出 PDF、图片或原生笔记备份。" onClick={() => setExportOpen(true)}><FileDown size={17} /></EditorButton>
          {!embedded && <EditorButton className={`editor-pages-toggle ${dualOpen ? 'active' : ''}`} aria-label="双开页面" help="在右侧打开另一篇笔记编辑，或参照当前笔记的另一页。" onClick={() => { if (dualOpen) closeDual(); else { setDualOpen(true); setPagesOpen(false); setDualPageId(pageId) } }}><Split size={17} /></EditorButton>}
          <EditorButton className="editor-pages-toggle" aria-label="全屏笔记" help="全屏显示画布和书写工具（F11）。" onClick={() => void toggleNoteFullscreen()}><Maximize size={18} /></EditorButton>
          <EditorButton
            className="editor-icon"
            aria-label="撤销"
            disabled={!historyFlags.undo}
            onClick={undo}
            help="撤回上一次更改（Ctrl/Cmd+Z）。"
          >
            <Undo2 size={18} />
          </EditorButton>
          <EditorButton
            className="editor-icon"
            aria-label="重做"
            disabled={!historyFlags.redo}
            onClick={redo}
            help="恢复刚撤回的更改（Ctrl/Cmd+Shift+Z）。"
          >
            <Redo2 size={18} />
          </EditorButton>
          <EditorButton
            className={`editor-pages-toggle ${pagesOpen ? 'active' : ''}`}
            aria-label={pagesOpen ? '收起页面缩略图' : '展开页面缩略图'}
            aria-expanded={pagesOpen}
            help="管理页面、图层和书签。"
            onClick={() => setPagesOpen(!pagesOpen)}
          >
            {pagesOpen ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
            <span>页面</span>
          </EditorButton>
        </div>
      </header>
      {inkReading && <div className="ink-reading-panel" role="region" aria-label="手写识别结果">
        <label>核对识别文字<textarea maxLength={24_000} value={inkReading.text}
          onChange={(event) => setInkReading({ ...inkReading, text: event.target.value })} /></label>
        <button onClick={() => void saveInkReading()}>保存到笔记索引</button>
        <button onClick={() => setInkReading(null)}>取消</button>
      </div>}
      {document && <PdfSearchPanel open={pdfSearchOpen && !noteFullscreen} initialQuery={initialPdfQuery} pages={document.pages} currentPageId={pageId} activeHit={pdfHit}
        onOcrUpdated={() => onPdfTextChanged?.(note.id)} onJump={jumpToPdfHit} onClear={() => setPdfHit(null)} onClose={closePdfSearch} />}
      {(saveState.startsWith('保存失败') ||
        saveState.startsWith('PDF 导入失败') ||
        saveState.startsWith('打开失败') ||
        recoveryNotice ||
        missingAssets.size > 0) && (
        <div className="editor-storage-warning" role="alert">
          {(saveState.startsWith('保存失败') || saveState.startsWith('PDF 导入失败') || saveState.startsWith('打开失败')) && (
            <span>{saveState}</span>
          )}
          {recoveryNotice && <span>{recoveryNotice}</span>}
          {missingAssets.size > 0 && <span>{missingAssets.size} 张图片资源缺失</span>}
          {saveState.startsWith('保存失败') && document && (
            <button onClick={() => saveLatest(document)}>重试保存</button>
          )}
        </div>
      )}
      {dualOpen && <div className="editor-dual-config" aria-label="双开设置">
        <span>右侧笔记</span>
        <select aria-label="选择参照笔记" value={dualNoteId} onChange={(event) => { setDualNoteId(event.target.value); setDualDocument(null); setDualPageId('') }}>
          <option value={note.id}>当前笔记（只读参照）</option>
          {otherNotes.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
        </select>
        <select aria-label="选择参照页面" value={dualPageId || (dualNoteId === note.id ? document?.pages[0]?.id : dualDocument?.pages[0]?.id) || ''} onChange={(event) => setDualPageId(event.target.value)}>
          {(dualNoteId === note.id ? document : dualDocument)?.pages.map((entry, index) => <option key={entry.id} value={entry.id}>{entry.bookmark || `第 ${index + 1} 页`}</option>)}
        </select>
        <button className="editor-dual-excerpt" onClick={() => void excerptDualPage()}>
          {otherNotes.some((entry) => entry.id === dualNoteId && (entry.workspace || entry.kind === 'markdown')) ? '摘录已保存正文' : '摘录本页到当前页'}
        </button>
        {!otherNotes.some((entry) => entry.id === dualNoteId && (entry.workspace || entry.kind === 'markdown')) &&
          <button className="editor-dual-excerpt" onClick={() => void excerptDualPage(true)}>框选摘录</button>}
        <button className="editor-dual-close" aria-label="关闭双开" onClick={closeDual}>×</button>
      </div>}
      <div className={`editor-body${dualOpen ? ' has-dual' : ''}`}>
        <div className="editor-canvas-column">
          {dualOpen && <div className="editor-dual-side-label">左侧笔记</div>}
          <div className="editor-toolbox" role="toolbar" aria-label="书写工具">
            {noteFullscreen && <>
              <EditorButton aria-label="撤销笔迹" help="撤回上一次更改。" disabled={!historyFlags.undo} onClick={undo}><Undo2 size={18} /></EditorButton>
              <EditorButton aria-label="重做笔迹" help="恢复刚撤回的更改。" disabled={!historyFlags.redo} onClick={redo}><Redo2 size={18} /></EditorButton>
              <span className="tool-divider" />
            </>}
            {toolButtons.map(({ id, name, help, Icon }) => (
              <EditorButton
                key={id}
                aria-label={name}
                help={help}
                aria-pressed={tool === id}
                aria-keyshortcuts={id === 'select' ? 'V' : undefined}
                className={tool === id ? 'active' : ''}
                onClick={() => chooseEditorTool(id)}
              >
                <Icon size={20} />
              </EditorButton>
            ))}
            {tool === 'shape' && <select className="editor-shape-select" aria-label="形状类型" value={shapePreset} onChange={(event) => setShapePreset(event.target.value as 'rect' | 'ellipse' | 'line')}><option value="rect">矩形</option><option value="ellipse">椭圆</option><option value="line">直线</option></select>}
            <span className="tool-divider" />
            {tool === 'highlighter' ? (<>
              <EditorButton aria-label="荧光笔颜色" help="选择半透明的荧光颜色。" aria-haspopup="dialog" aria-expanded={toolPanel?.kind === 'highlighter'} onClick={(event) => openToolPanel('highlighter', event.currentTarget)}>
                <span className="editor-ink-swatch highlight-swatch" style={{ backgroundColor: highlightColor }} />
              </EditorButton>
              <EditorButton aria-label="自定义荧光笔宽" help="拖动滑块或输入精确笔宽。" aria-haspopup="dialog" aria-expanded={toolPanel?.kind === 'highlight-width'} onClick={(event) => openToolPanel('highlight-width', event.currentTarget)}>{highlightWidth} px</EditorButton>
            </>
            ) : tool === 'eraser' ? (
              <EditorButton aria-label={`橡皮大小 ${eraserDiameter} 像素`} label="橡皮大小" help="拖动滑块或输入直径，最大可设为页面大小。" aria-haspopup="dialog" aria-expanded={toolPanel?.kind === 'eraser'} onClick={(event) => openToolPanel('eraser', event.currentTarget)}>
                <span className="editor-eraser-size">{eraserDiameter}</span>
              </EditorButton>
            ) : (
              <>
                {[2, 4, 8].map((width) => <EditorButton key={width} aria-label={`${width} 像素笔宽`} help="设置钢笔线条的基础粗细。" aria-pressed={penWidth === width} className={penWidth === width ? 'active' : ''} onClick={() => setPenWidth(width)}><span className="pen-width-dot" style={{ width, height: width }} /></EditorButton>)}
                <EditorButton aria-label="自定义钢笔笔宽" help="拖动滑块或输入精确笔宽。" aria-haspopup="dialog" aria-expanded={toolPanel?.kind === 'width'} onClick={(event) => openToolPanel('width', event.currentTarget)}>{penWidth} px</EditorButton>
                <EditorButton aria-label={`墨色 ${inkColor}`} label="墨色" help="打开色板，选择钢笔和文本的颜色。" aria-haspopup="dialog" aria-expanded={toolPanel?.kind === 'pen'} onClick={(event) => openToolPanel('pen', event.currentTarget)}>
                  <span className="editor-ink-swatch" style={{ backgroundColor: inkColor }} />
                </EditorButton>
                {tool === 'pen' && <>
                  <EditorButton aria-label="笔刷设置" help="选择笔尖、平滑强度和压力曲线。" aria-haspopup="dialog" aria-expanded={toolPanel?.kind === 'brush'} onClick={(event) => openToolPanel('brush', event.currentTarget)}><SlidersHorizontal size={18} /></EditorButton>
                  <EditorButton aria-label="钢笔压感" help={penPressure ? '已开启，笔压决定粗细。点击可关闭。' : '已关闭，笔迹使用固定宽度。点击可开启。'} aria-pressed={penPressure} className={penPressure ? 'active' : ''} onClick={() => setPenPressure(!penPressure)}><Activity size={19} /></EditorButton>
                </>}
              </>
            )}
            <span className="tool-divider" />
            {tool === 'select' && selectedIds.length > 0 && <>
              {selectedShape && page && <label className="shape-color-control" title="形状颜色">颜色<input type="color" aria-label="形状颜色" value={selectedShape.color} onChange={(event) => {
                const history = historyRef.current
                if (history) publish(history.changeElements(page.id, [{ id: selectedShape.id, after: { ...selectedShape, color: event.target.value } }]))
              }} /></label>}
              {selectedTape && page && <EditorButton aria-label={selectedTape.revealed ? '盖回遮挡胶带' : '揭开遮挡胶带'} help="切换所选胶带的遮挡状态。" onClick={() => {
                const history = historyRef.current
                if (history) publish(history.changeElements(page.id, [{ id: selectedTape.id, after: { ...selectedTape, revealed: !selectedTape.revealed } }]))
              }}><ScanEye size={17} /></EditorButton>}
              {selectedText && page && <EditorButton aria-label="编辑文本" help="修改选中文字框里的内容。" onClick={() => editText(selectedText, page.id)}><Type size={18} /></EditorButton>}
              <EditorButton aria-label="复制选区" help="在旁边创建一份选中内容的副本。" onClick={() => transformSelection('copy')}><Copy size={18} /></EditorButton>
              <EditorButton aria-label="缩小选区" help="按比例缩小选中的内容。" onClick={() => transformSelection('smaller')}>−</EditorButton>
              <EditorButton aria-label="放大选区" help="按比例放大选中的内容。" onClick={() => transformSelection('larger')}>+</EditorButton>
              <EditorButton aria-label="删除选区" help="从当前页删除选中的内容。" onClick={() => transformSelection('delete')}><Trash2 size={18} /></EditorButton>
            </>}
            {selectedId && document?.excerpts?.some((entry) => entry.elementId === selectedId) && <EditorButton aria-label="打开摘录来源" help="在双开窗格定位到原始页面。" onClick={() => { const link = document.excerpts!.find((entry) => entry.elementId === selectedId)!; if (link.sourceNoteId !== note.id && !otherNotes.some((entry) => entry.id === link.sourceNoteId)) { setSaveState('来源笔记已移动到回收站、删除或未随备份迁入'); return } setDualNoteId(link.sourceNoteId); setDualPageId(link.sourcePageId); setDualOpen(true) }}><BookOpen size={18} /></EditorButton>}
            <EditorButton aria-label="贴入图片" help="从电脑选择一张图片插入当前页。" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={19} />
            </EditorButton>
            {tool === 'select' && selectedImage && page && <EditorButton aria-label="裁剪图片" help="框选图片里要保留的部分。" disabled={!assetUrls[selectedImage.assetId]} onClick={() => setCropTarget({ pageId: page.id, image: selectedImage, dataUrl: assetUrls[selectedImage.assetId] })}><Crop size={19} /></EditorButton>}
            <EditorButton aria-label="区域截图" help="截取屏幕的一部分，插入笔记或贴到桌面。" onClick={() => void startCapture()}>
              <Camera size={19} />
            </EditorButton>

            <EditorButton
              aria-label="贴到桌面"
              help="把选中的图片放到置顶小窗。"
              disabled={!selectedImage}
              onClick={() => {
                if (selectedImage) void window.liftInk.pinImage(selectedImage.assetId)
              }}
            >
              <Pin size={18} />
            </EditorButton>
            {noteFullscreen && <EditorButton aria-label="退出全屏" help="退出全屏（Esc 或 F11）。" onClick={() => void toggleNoteFullscreen()}><Minimize size={18} /></EditorButton>}
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
            <input ref={pdfRef} className="editor-file-input" type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) promptPdfImport(file); event.target.value = '' }} />
            <input ref={backupRef} className="editor-file-input" type="file" accept=".liftink" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreBackup(file); event.target.value = '' }} />
          </div>
          <div
            className={`editor-canvas ${dualOpen ? 'with-dual' : ''}`}
            ref={scrollRef}
            onDragOver={(event) => {
              event.preventDefault()
              if (event.dataTransfer.types.includes('Files'))
                event.dataTransfer.dropEffect = importing ? 'none' : 'copy'
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              const files = [...event.dataTransfer.files]
              const pdf = files.find(isPdfFile)
              if (pdf) {
                if (files.length !== 1) setSaveState('PDF 导入失败：请每次拖入一个 PDF')
                else promptPdfImport(pdf)
              } else {
                const image = files.find((file) => file.type.startsWith('image/'))
                if (image) void insertFile(image)
              }
            }}
          >
            {document?.pages.map((canvasPage, index) => {
              const { width, height } = pageSize(canvasPage)
              const fit = availableWidth > 0 && (canvasPage.size || dualOpen || embedded)
                ? Math.min(1, Math.max(0.25, availableWidth / width)) : 1
              const paperZoom = zoom * fit
              return <div key={canvasPage.id} data-page={canvasPage.id} data-image-drop={highlightedDropPage === canvasPage.id ? 'true' : undefined} className={`editor-paper ${canvasPage.paper} ${canvasPage.id === pageId ? 'current' : ''}`} style={{ width: width * paperZoom, height: height * paperZoom, minHeight: height * paperZoom, backgroundColor: canvasPage.paperColor && paperColors[canvasPage.paperColor] }}>
                <PageRuling page={canvasPage} />
                {canvasPage.backgroundAssetId && assetUrls[canvasPage.backgroundAssetId] && <img className="editor-page-background" src={assetUrls[canvasPage.backgroundAssetId]} alt="PDF 原页" />}
                {canvasPage.sourcePdfId && canvasPage.sourcePageNumber &&
                  (!canvasPage.backgroundAssetId || (canvasPage.id === pageId && (paperZoom * window.devicePixelRatio > 1.4))) &&
                  <PdfPagePreview source={canvasPage.sourcePdfId} page={canvasPage.sourcePageNumber} width={width * paperZoom} height={height * paperZoom} />}
                <svg
                  className={`editor-live-canvas tool-${tool}`}
                  aria-label="笔记画布"
                  data-page-id={canvasPage.id}
                  viewBox={`0 0 ${width} ${height}`}
                  preserveAspectRatio="none"
                  onPointerDown={pointerDown}
                  onContextMenu={(event) => { if (preferences.sideButton !== 'none') event.preventDefault() }}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={pointerCancel}
                  onLostPointerCapture={pointerCancel}
                  onPointerEnter={updateHover}
                  onPointerLeave={() => setHover(null)}
                  onDoubleClick={editCanvasText}
                >
                  {pdfHit?.pageId === canvasPage.id && (
                    <g pointerEvents="none" aria-hidden="true">
                      {pdfHit.marks.map((mark, index) => (
                        <rect
                          key={index}
                          className="editor-pdf-search-mark"
                          x={mark.x}
                          y={mark.y}
                          width={mark.width}
                          height={mark.height}
                          transform={`rotate(${mark.angle * 180 / Math.PI} ${mark.x} ${mark.y})`}
                        />
                      ))}
                    </g>
                  )}
                  {renderCanvasElements(canvasPage, 'image')}
                  {renderCanvasElements(canvasPage, 'highlighter', multiplyHighlighter(canvasPage))}
                  <g data-live-ink="highlighter" pointerEvents="none" />
                  {renderCanvasElements(canvasPage, 'foreground')}
                  <g data-live-ink="pen" pointerEvents="none" />
                  {canvasPage.id === pageId && lassoPoints.length > 1 && <polyline points={lassoPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#7864bb" strokeDasharray="6 4" strokeWidth="1.5" pointerEvents="none" />}
                  {canvasPage.id === pageId && shapePreview?.kind === 'shape' && <rect x={Math.min(shapePreview.start.x, shapePreview.current.x)} y={Math.min(shapePreview.start.y, shapePreview.current.y)} width={Math.abs(shapePreview.current.x - shapePreview.start.x)} height={Math.abs(shapePreview.current.y - shapePreview.start.y)} fill={shapePreview.tool === 'tape' ? '#d9cee999' : 'none'} stroke={inkColor} strokeDasharray="5 4" pointerEvents="none" />}
                  {canvasPage.id === hover?.pageId && (
                    <circle
                      className={tool === 'eraser' ? 'editor-eraser-outline' : undefined}
                      cx={hover.point.x}
                      cy={hover.point.y}
                      r={tool === 'eraser' ? eraserDiameterFor(canvasPage) / 2 : 1.6 / paperZoom}
                      fill={tool === 'eraser' ? '#7059c61a' : inkColor}
                      stroke={tool === 'eraser' ? '#514765' : inkColor}
                      strokeWidth={tool === 'eraser' ? 1.3 : 0}
                      vectorEffect="non-scaling-stroke"
                      opacity=".75"
                      pointerEvents="none"
                    />
                  )}
                  {tool === 'select' && !pageTransfer && canvasPage.id === pageId && selectedIds.map((id) => {
                    const selected = canvasPage.elements.find((element) => element.id === id)
                    if (!selected || selected.kind === 'image' || !canEdit(selected, canvasPage)) return null
                    const original = resizePreview?.id === id ? resizePreview : selected
                    const shown = original.kind === 'text' && (dragPreview.dx || dragPreview.dy)
                      ? positionCanvasText(original, width, { width, height }, dragPreview.dx, dragPreview.dy) : original
                    const bounds = elementBounds(original, width)
                    const x = bounds.x + (shown.kind === 'text' ? 0 : dragPreview.dx)
                    const y = shown.kind === 'text' ? shown.y - shown.fontSize : bounds.y + dragPreview.dy
                    const left = shown.kind === 'text' ? shown.x : x
                    const midX = (Math.max(0, left) + Math.min(width, left + bounds.width)) / 2
                    const midY = (Math.max(0, y) + Math.min(height, y + bounds.height)) / 2
                    return <g key={id} className="editor-selection">
                      <rect data-text-box={shown.kind === 'text' ? '' : undefined} x={left} y={y} width={bounds.width} height={bounds.height} fill="none" stroke="#7560d0" strokeDasharray="5 4" pointerEvents="none" />
                      {id === selectedId && shown.kind === 'text' && <>
                        {original.kind === 'text' && layoutCanvasText(original, width).overflow && <text x={left + 6} y={y + bounds.height - 4} fontSize="13" fill="#7560d0" pointerEvents="none"><title>框内还有文字，可拉高文本框查看</title>…</text>}
                        {[
                          { edge: 'w', x: left, y: midY, label: '从左侧调整文本框宽度' },
                          { edge: 'e', x: left + bounds.width, y: midY, label: '调整文本框宽度' },
                          { edge: 'n', x: midX, y, label: '从顶部调整文本框高度' },
                          { edge: 's', x: midX, y: y + bounds.height, label: '调整文本框高度' },
                          { edge: 'se', x: left + bounds.width, y: y + bounds.height, label: '调整文本框宽高' }
                        ].map((handle) => <rect key={handle.edge} data-handle="resize" data-resize-edge={handle.edge} aria-label={handle.label}
                          x={handle.x - 5} y={handle.y - 5} width="10" height="10" rx="2" fill="#7560d0"><title>{handle.label}</title></rect>)}
                      </>}
                      {id === selectedId && selected.kind === 'tape' &&
                        <rect data-handle="resize" aria-label="拖动调整胶带大小" x={x + bounds.width - 7} y={y + bounds.height - 7} width="14" height="14" rx="3" fill="#7560d0" />}
                      {id === selectedId && shown.kind === 'shape' &&
                        <rect data-handle="resize" aria-label="拖动调整形状大小" x={shown.x + shown.width + dragPreview.dx - 6} y={shown.y + shown.height + dragPreview.dy - 6} width="12" height="12" rx="2" fill="#7560d0" />}
                    </g>
                  })}
                  {tool === 'select' && !pageTransfer && canvasPage.id === pageId && shownImage && (
                    <g className="editor-selection">
                      <rect
                        x={shownImage.x + dragPreview.dx}
                        y={shownImage.y + dragPreview.dy}
                        width={shownImage.width}
                        height={shownImage.height}
                        fill="none"
                        stroke="#7560d0"
                        strokeWidth="2"
                        pointerEvents="none"
                      />
                      <rect
                        data-handle="resize"
                        x={shownImage.x + dragPreview.dx + shownImage.width - 8}
                        y={shownImage.y + dragPreview.dy + shownImage.height - 8}
                        width="16"
                        height="16"
                        rx="3"
                        fill="#7560d0"
                      />
                    </g>
                  )}
                </svg>
                {selectPdfText && !noteFullscreen && canvasPage.sourcePdfId && <PdfTextOverlay page={canvasPage} width={width * paperZoom} height={height * paperZoom} />}
                <span className="paper-page-number">
                  {index + 1}
                </span>
              </div>
            })}
          </div>
          <footer className="editor-statusbar">
            <div className="paper-options" aria-label="纸张样式">
              {(
                [
                  ['lines', '横线'],
                  ['grid', '方格'],
                  ['blank', '空白'],
                  ['dots', '点阵']
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
              {page && page.paper !== 'blank' && (
                <select
                  aria-label="纸张间距"
                  value={page.paperSpacing ?? 'standard'}
                  onChange={(event) => {
                    if (historyRef.current)
                      publish(historyRef.current.setPaper(page.id, page.paper, event.target.value as PaperSpacing))
                  }}
                >
                  {paperSpacings.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              )}
            </div>
            <div className="editor-timer" aria-label="笔记计时">
              <span className="editor-focus-time" title="窗口失焦或两分钟无操作后暂停累计，双开时记录当前操作的笔记">本篇累计 <strong>{formatDuration(focusTotal(note) + (focusActive ? focusTick : 0))}</strong></span>
              <Timer size={15} aria-hidden="true" />
              {countdownLeft === null
                ? <label><input aria-label="倒计时分钟" type="number" min="1" max="180" value={countdownMinutes || ''} onChange={(event) => setCountdownMinutes(event.target.valueAsNumber || 0)} /> 分</label>
                : <span aria-live={countdownLeft === 0 ? 'polite' : 'off'}>{countdownLeft === 0 ? '时间到' : `${String(Math.floor(countdownLeft / 60)).padStart(2, '0')}:${String(countdownLeft % 60).padStart(2, '0')}`}</span>}
              <button aria-label={countdownEnd ? '暂停倒计时' : '开始倒计时'} disabled={countdownLeft === 0 || (countdownLeft === null && (countdownMinutes < 1 || countdownMinutes > 180))} onClick={() => {
                if (countdownEnd !== null) { setCountdownLeft(Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000))); setCountdownEnd(null) }
                else { const seconds = countdownLeft ?? Math.round(countdownMinutes * 60); setCountdownLeft(seconds); setCountdownEnd(Date.now() + seconds * 1000) }
              }}>{countdownEnd ? '暂停' : countdownLeft === null ? '倒计时' : '继续'}</button>
              {countdownLeft !== null && <button aria-label="重置倒计时" onClick={() => { setCountdownEnd(null); setCountdownLeft(null) }}>重置</button>}
            </div>
            <div className="editor-zoom-controls" aria-label="画布缩放" title="Ctrl + 鼠标滚轮缩放">
              <button aria-label="缩小画布" onClick={() => setZoom((value) => Math.max(0.25, Math.round((value - 0.25) * 100) / 100))}>−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button aria-label="放大画布" onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.25) * 100) / 100))}>+</button>
            </div>
            <span>
              第 {(document?.pages.findIndex((item) => item.id === pageId) ?? 0) + 1} /{' '}
              {document?.pages.length ?? 1} 页
            </span>
          </footer>
        </div>
        {dualOpen && <>
          <div className="editor-dual-divider" role="separator" aria-label="调节双开比例" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(dualRatio * 100)} tabIndex={0}
            onPointerDown={(event) => { if (event.button !== 0) return; dualResize.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId) }}
            onPointerMove={(event) => { if (event.pointerId === dualResize.current) adjustSplit(event) }}
            onLostPointerCapture={() => { dualResize.current = null }}
            onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setDualRatio((ratio) => Math.max(0.3, Math.min(0.7, ratio + (event.key === 'ArrowLeft' ? 0.05 : -0.05)))) } }}
          />
          <aside ref={companionPanel} className="editor-dual-panel" aria-label="双开笔记" style={{ flexBasis: `${dualRatio * 100}%` }}>
          {rightNote && (rightNote.workspace || rightNote.kind === 'markdown') ? renderCompanion?.(rightNote.id, closeDual) : rightNote ? <LiveNoteEditorView key={rightNote.id} note={rightNote} folders={folders} otherNotes={[]} onBack={closeDual}
            onTitleChange={(title) => onChangeOtherNote?.(rightNote.id, { title })} onFolderChange={(folder) => onChangeOtherNote?.(rightNote.id, { folder })}
            tagCatalog={tagCatalog} onTagsChange={(tags) => onChangeOtherNote?.(rightNote.id, { tags })} onCreateTag={onCreateTag} preferences={preferences} onBrushPreferences={onBrushPreferences}
            onDocumentSaved={onDocumentSaved} onPdfTextChanged={onPdfTextChanged} onFocusTime={onFocusTime} onActivate={onActivate} focusNoteId={focusNoteId}
            embedded requestedPageId={dualPageId} imageDropRef={companionImageDrop} highlightedDropPage={companionDropPage} /> : referencePage ? (
            <svg className="editor-dual-page" data-reference-page={referencePage.id} data-image-drop={referenceImages.length ? 'true' : undefined}
              role="img" aria-label="参照页面" viewBox={`0 0 ${referenceSize.width} ${referenceSize.height}`}>
              <image href={referenceUrl} width={referenceSize.width} height={referenceSize.height} />
              {referenceImages.map((element) => element.kind === 'image' && assetUrls[element.assetId] && (
                <image key={element.id} href={assetUrls[element.assetId]} x={element.x} y={element.y}
                  width={element.width} height={element.height} />
              ))}
            </svg>
          ) : <p>正在打开参照笔记…</p>}
        </aside></>}
        {pagesOpen && (
          <aside className="editor-page-manager" aria-label="页面缩略图目录">
            <div className="page-manager-tabs">
              {(['pages', 'layers', 'bookmarks'] as const).map((tab) => <button key={tab} className={sidebarTab === tab ? 'active' : ''} onClick={() => setSidebarTab(tab)}>{tab === 'pages' ? '页面' : tab === 'layers' ? '图层' : '书签'}</button>)}
            </div>
            {sidebarTab === 'pages' && <>
            <div className="page-manager-heading">
              <strong>页面</strong>
              <button
                aria-label="新增页面"
                onClick={() => {
                  if (!historyRef.current) return
                  const next = {
                    id: crypto.randomUUID(),
                    paper: (page?.paper ?? 'lines') as PaperKind,
                      paperColor: page?.paperColor,
                      size: page?.sourcePdfId ? undefined : page?.size,
                    paperSpacing: page?.paperSpacing,
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
                <div key={item.id} className="page-manager-item">
                  <button className={`page-thumbnail ${pageId === item.id ? 'selected' : ''}`} onClick={() => { setPageId(item.id); setSelectedId(null); setSelectedIds([]); scrollRef.current?.querySelector(`[data-page="${item.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                    <span className={item.paper} />
                    <small>{item.bookmark || `第 ${index + 1} 页`}</small>
                  </button>
                  <div className="page-manager-actions">
                    <button aria-label={`第 ${index + 1} 页书签`} title="设置书签" onClick={() => { setEditorPrompt({ kind: 'bookmark', pageId: item.id }); setPromptValue(item.bookmark || `第 ${index + 1} 页`) }}><Bookmark size={14} fill={item.bookmark ? 'currentColor' : 'none'} /></button>
                    <button aria-label={`第 ${index + 1} 页上移`} disabled={index === 0} onClick={() => { if (historyRef.current) publish(historyRef.current.movePage(item.id, -1)) }}><ChevronUp size={14} /></button>
                    <button aria-label={`第 ${index + 1} 页下移`} disabled={index === (document?.pages.length ?? 0) - 1} onClick={() => { if (historyRef.current) publish(historyRef.current.movePage(item.id, 1)) }}><ChevronDown size={14} /></button>
                    <button aria-label={`删除第 ${index + 1} 页`} disabled={(document?.pages.length ?? 0) <= 1} onClick={() => setPageToDelete(item.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            </>}
            {sidebarTab === 'layers' && <div className="editor-layer-list">
              <div className="page-manager-heading"><strong>当前页图层</strong><button aria-label="新增图层" onClick={() => { if (!page) return; setEditorPrompt({ kind: 'layer', pageId: page.id }); setPromptValue(`图层 ${layers.length}`) }}><Plus size={17} /></button></div>
              <div className="editor-layer-fixed"><LockKeyhole size={15} /> PDF / 纸张底图 <small>只读</small></div>
              {layers.map((layer) => <div key={layer.id} className={`editor-layer-row ${activeLayerId === layer.id ? 'active' : ''}`}>
                <button className="editor-layer-name" onClick={() => setActiveLayerId(layer.id)}>{layer.name}</button>
                <button aria-label={`${layer.name}${layer.visible ? '隐藏' : '显示'}`} onClick={() => { if (page && historyRef.current) publish(historyRef.current.updatePage(page.id, { layers: layers.map((entry) => entry.id === layer.id ? { ...entry, visible: !entry.visible } : entry) })) }}>{layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                <button aria-label={`${layer.name}${layer.locked ? '解锁' : '锁定'}`} onClick={() => { if (page && historyRef.current) publish(historyRef.current.updatePage(page.id, { layers: layers.map((entry) => entry.id === layer.id ? { ...entry, locked: !entry.locked } : entry) })) }}>{layer.locked ? <LockKeyhole size={15} /> : <LockKeyholeOpen size={15} />}</button>
              </div>)}
            </div>}
            {sidebarTab === 'bookmarks' && <div className="editor-bookmark-list"><strong>目录与书签</strong>{document?.pages.filter((entry) => entry.bookmark).map((entry) => <button key={entry.id} onClick={() => { setPageId(entry.id); scrollRef.current?.querySelector(`[data-page="${entry.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}><Bookmark size={15} />{entry.bookmark}</button>)}{!document?.pages.some((entry) => entry.bookmark) && <p>在页面栏为重要页面设置书签。</p>}</div>}
          </aside>
        )}
      </div>
      <Dialog.Root open={pageToDelete !== null} onOpenChange={(open) => { if (!open) setPageToDelete(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="editor-export-backdrop" />
          <Dialog.Content className="editor-export-dialog editor-delete-page" role="alertdialog">
            <Dialog.Title>删除第 {(document?.pages.findIndex((entry) => entry.id === pageToDelete) ?? -1) + 1} 页？</Dialog.Title>
            <Dialog.Description>此页上的笔迹、图片和文字会一起移除。删除后可以撤销。</Dialog.Description>
            <div className="editor-export-actions">
              <Dialog.Close asChild><button type="button">取消</button></Dialog.Close>
              <button type="button" className="editor-delete-page-action" onClick={() => {
                const history = historyRef.current
                const index = history?.current.pages.findIndex((entry) => entry.id === pageToDelete) ?? -1
                if (history && pageToDelete && index >= 0 && history.current.pages.length > 1) {
                  const next = history.removePage(pageToDelete)
                  publish(next)
                  if (pageId === pageToDelete) {
                    setPageId(next.pages[Math.min(index, next.pages.length - 1)].id)
                    setSelectedId(null)
                    setSelectedIds([])
                  }
                }
                setPageToDelete(null)
              }}>删除页面</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={!!pendingPdf} onOpenChange={(open) => { if (!open) setPendingPdf(null) }}>
        <Dialog.Portal container={noteFullscreen ? editorRoot.current : undefined}>
          <Dialog.Overlay className="editor-export-backdrop" />
          <Dialog.Content className="editor-export-dialog editor-delete-page">
            <Dialog.Title>插入 PDF</Dialog.Title>
            <Dialog.Description>{pendingPdf?.file.name}</Dialog.Description>
            <label>插入位置<select aria-label="插入位置" value={pendingPdf?.before ?? 'end'} onChange={(event) => {
              const before = event.target.value
              setPendingPdf((current) => current && { ...current, before })
            }}>
              <option value="start">插入最开始</option>
              {document && pagesForImport(document).map((item, index) => <option value={item.id} key={item.id}>在第 {index + 1} 页前插入</option>)}
              <option value="end">插入最末</option>
            </select></label>
            <div className="editor-export-actions">
              <Dialog.Close asChild><button type="button">取消</button></Dialog.Close>
              <button type="button" onClick={() => {
                if (!pendingPdf) return
                const { file, before } = pendingPdf
                setPendingPdf(null)
                void importPdf(file, before)
              }}>插入 PDF</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {exportOpen && <div className="editor-export-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false) }}>
        <div className="editor-export-dialog" role="dialog" aria-modal="true" aria-label="导出与备份">
          <header><strong>导出与备份</strong><button aria-label="关闭导出" onClick={() => setExportOpen(false)}>×</button></header>
          <label>页面范围 <select aria-label="导出页面范围" value={exportRange} onChange={(event) => setExportRange(event.target.value as 'current' | 'all')}><option value="all">整篇笔记</option><option value="current">当前页</option></select></label>
          <label><input type="checkbox" checked={exportBackground} onChange={(event) => setExportBackground(event.target.checked)} /> 包含纸张或 PDF 底图</label>
          <p>PDF 保留页面顺序；多页 PNG 打包为 ZIP。导出整篇时跳过自动续写的空白尾页。</p>
          <div className="editor-export-actions">{[...new Set([preferences.exportFormat, 'pdf', 'png', 'liftink'] as const)].map((format) => (
            <button key={format} autoFocus={format === preferences.exportFormat} onClick={() => void exportNote(format)}>{format === 'liftink' ? '原生备份' : `导出 ${format.toUpperCase()}`}</button>
          ))}</div>
          <button className="editor-backup-restore" onClick={() => { setExportOpen(false); backupRef.current?.click() }}>从 .liftink 恢复到当前笔记</button>
        </div>
      </div>}
      {editorPrompt && <div className="editor-export-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setEditorPrompt(null) }}>
        <form className="editor-export-dialog" role="dialog" aria-modal="true" aria-label={editorPrompt.kind === 'text' ? '输入文本' : editorPrompt.kind === 'layer' ? '新增图层' : '设置书签'} onSubmit={(event) => { event.preventDefault(); commitPrompt() }}>
          <header><strong>{editorPrompt.kind === 'text' ? (editorPrompt.elementId ? '编辑文本' : '插入文本') : editorPrompt.kind === 'layer' ? '新增图层' : '页面书签'}</strong><button type="button" aria-label="取消输入" onClick={() => setEditorPrompt(null)}>×</button></header>
          {editorPrompt.kind === 'text' ? <>
            <div className="canvas-text-controls" role="toolbar" aria-label="文本格式">
              <EditorButton type="button" aria-label="加粗" help="为选中文字添加 **加粗**。" onMouseDown={(event) => event.preventDefault()} onClick={() => markPromptText('**')}><Bold size={17} /></EditorButton>
              <EditorButton type="button" aria-label="斜体" help="为选中文字添加 *斜体*。" onMouseDown={(event) => event.preventDefault()} onClick={() => markPromptText('*')}><Italic size={17} /></EditorButton>
              <EditorButton type="button" aria-label="删除线" help="为选中文字添加 ~~删除线~~。" onMouseDown={(event) => event.preventDefault()} onClick={() => markPromptText('~~')}><Strikethrough size={17} /></EditorButton>
              <EditorButton type="button" aria-label="等宽片段" help="为选中文字添加行内代码样式。" onMouseDown={(event) => event.preventDefault()} onClick={() => markPromptText('`')}><Code size={17} /></EditorButton>
              <label className="canvas-text-markdown"><input type="checkbox" checked={promptMarkdown} onChange={(event) => setPromptMarkdown(event.target.checked)} /> Markdown</label>
            </div>
            <textarea ref={promptText} autoFocus aria-label="文本内容" maxLength={10000} value={promptValue}
              onSelect={(event) => setPromptSelection({ from: event.currentTarget.selectionStart, to: event.currentTarget.selectionEnd })}
              onChange={(event) => { const next = event.target.value; setPromptStyles((current) => remapCanvasText(current, promptValue, next)); setPromptValue(next) }} rows={4} />
            <div className="canvas-text-controls canvas-text-properties">
              <label>字体 <select aria-label="文本字体" value={promptLocalStyle?.font ?? promptFont} onChange={(event) => changePromptStyle({ font: event.target.value as CanvasTextFont })}>
                <option value="sans">无衬线</option><option value="serif">衬线</option><option value="mono">等宽</option>
              </select></label>
              <label>字号 <input aria-label="文本字号" type="number" min="8" max="160" step="0.1" value={promptSize} onChange={(event) => setPromptSize(event.target.value)} /> px</label>
              <label>颜色 <input aria-label="文本颜色" type="color" value={promptLocalStyle?.color ?? promptColor} onChange={(event) => changePromptStyle({ color: event.target.value })} /></label>
            </div>
            <small>字体与颜色：{promptSelection.from < promptSelection.to ? '选中文字' : '整个文本框'}</small>
            {promptValue && <div className="canvas-text-preview" aria-label="文本预览" style={{ color: promptColor, fontSize: Math.max(8, Math.min(160, Number(promptSize) || textSize)) }}>
              {canvasTextLines({ text: promptValue, format: promptMarkdown ? 'markdown' : undefined, styles: promptStyles }).map((line, index) => <div key={index}>
                {line.map((run, i) => <span key={i} style={canvasTextStyle(run, promptFont)}>{run.text}</span>)}
              </div>)}
            </div>}
          </> : <input autoFocus aria-label={editorPrompt.kind === 'layer' ? '图层名称' : '书签名称'} value={promptValue} onChange={(event) => setPromptValue(event.target.value)} />}
          <div className="editor-export-actions"><button type="button" onClick={() => setEditorPrompt(null)}>取消</button><button type="submit">确定</button></div>
        </form>
      </div>}
      {excerptCrop && <CaptureDialog purpose="excerpt" screen={{ dataUrl: excerptCrop.url, label: '来源页面' }}
        onClose={() => setExcerptCrop(null)}
        onResult={async (_mode, url) => insertExcerptImage(url, excerptCrop.targetPageId, excerptCrop.sourceNoteId, excerptCrop.sourcePageId, excerptCrop.layerId)} />}
      {capture && (
        <CaptureDialog screen={capture} onClose={() => setCapture(null)} onResult={acceptCapture} />
      )}
      {cropTarget && (
        <CaptureDialog purpose="crop" screen={{ dataUrl: cropTarget.dataUrl, label: '' }} onClose={() => setCropTarget(null)} onResult={acceptCrop} />
      )}
      {inkComparisonOpen && <InkComparison initial={lastInkTrace.current} container={noteFullscreen ? editorRoot.current : undefined} onClose={() => setInkComparisonOpen(false)} />}
      {toolPanel && (
        <ToolPopover anchor={toolPanel.anchor} label={{ pen: '选择墨色', highlighter: '选择荧光颜色', brush: '笔刷设置', eraser: '选择橡皮大小', width: '钢笔笔宽', 'highlight-width': '荧光笔宽' }[toolPanel.kind]} onClose={() => setToolPanel(null)}>
          {toolPanel.kind === 'width' || toolPanel.kind === 'highlight-width' ? (
            <BrushWidthControl value={toolPanel.kind === 'width' ? penWidth : highlightWidth}
              min={toolPanel.kind === 'width' ? 0.5 : 2} max={toolPanel.kind === 'width' ? 32 : 64}
              onChange={toolPanel.kind === 'width' ? setPenWidth : setHighlightWidth} />
          ) : toolPanel.kind === 'brush' ? (
            <div className="editor-brush-settings">
              <div className="editor-brush-options">
                {(Object.keys(penStyles) as PenStyle[]).map((style) => <button key={style} title={penStyles[style].help} aria-pressed={penStyle === style} onClick={() => setPenStyle(style)}>{penStyles[style].name}</button>)}
              </div>
              <label>平滑 <output>{Math.round(stability * 100)}%</output><input aria-label="笔迹平滑" type="range" min="0" max="1" step="0.05" value={stability} onChange={(event) => { const value = event.target.valueAsNumber; setStability(value); onBrushPreferences?.({ stability: value }) }} /></label>
              <label>压感曲线 <output>{pressureCurve < 0.95 ? '偏软' : pressureCurve > 1.05 ? '偏硬' : '线性'}</output><input aria-label="压感曲线" type="range" min="0.5" max="2" step="0.05" value={pressureCurve} onChange={(event) => { const value = event.target.valueAsNumber; setPressureCurve(value); onBrushPreferences?.({ pressureCurve: value }) }} /></label>
              <svg viewBox="0 0 204 55" aria-label="压感曲线预览"><path d="M2 53L202 2" stroke="#d6cedf" strokeDasharray="3 3" /><polyline points={Array.from({ length: 21 }, (_, index) => `${2 + index * 10},${53 - Math.pow(index / 20, pressureCurve) * 51}`).join(' ')} fill="none" stroke="#6c52b7" strokeWidth="2" /></svg>
              <button type="button" onClick={() => { chooseToolOption(); setInkComparisonOpen(true) }}>笔迹对照</button>
            </div>
          ) : toolPanel.kind === 'eraser' ? (
            <div className="editor-eraser-settings">
              <div className="editor-eraser-options">
                {[12, 24, 40].map((diameter) => (
                  <button key={diameter} type="button" aria-pressed={eraserSize === diameter} onClick={() => { setEraserSize(diameter); chooseToolOption() }}>
                    {diameter} px
                  </button>
                ))}
                <button type="button" aria-pressed={eraserSize === 'page'} onClick={() => { setEraserSize('page'); chooseToolOption() }}>页面大小</button>
              </div>
              <BrushWidthControl label="直径" value={eraserDiameter} min={4} max={maxEraserDiameter}
                logarithmic step={1} onChange={(size) => setEraserSize(size === maxEraserDiameter ? 'page' : size)} />
            </div>
          ) : (
            <>
              <div className="editor-color-options">
                {(toolPanel.kind === 'pen' ? inkPalette : highlightPalette).map(({ name, color }) => (
                  <button key={color} type="button" aria-label={name} title={name} aria-pressed={(toolPanel.kind === 'pen' ? inkColor : highlightColor) === color} onClick={() => {
                    if (toolPanel.kind === 'pen') setInkColor(color)
                    else setHighlightColor(color)
                    chooseToolOption()
                  }}>
                    <span className={toolPanel.kind === 'highlighter' ? 'highlight-swatch' : undefined} style={{ backgroundColor: color }} />
                  </button>
                ))}
              </div>
              {toolPanel.kind === 'pen' ? <label className="editor-custom-color">自定义颜色 <input type="color" aria-label="自定义颜色" value={inkColor} onChange={(event) => setInkColor(event.target.value)} /></label> : <small>所有荧光颜色均为半透明。</small>}
            </>
          )}
        </ToolPopover>
      )}
    </section>
  )
}
