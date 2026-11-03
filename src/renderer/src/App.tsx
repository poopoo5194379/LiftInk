import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Dialog from './components/ui/dialog'
import LiveNoteEditorView from './components/LiveNoteEditorView'
import type { NoteRecord } from '../../shared/editor'
import RecentFilesView from './components/RecentFilesView'
import TagsView from './components/TagsView'
import AgendaView from './components/AgendaView'
import QuickWorkspaceView, {
  type QuickDraft,
  type QuickKind
} from './components/QuickWorkspaceView'
import PenInputPocView from './components/PenInputPocView'
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Home,
  Maximize2,
  Mic,
  MoreHorizontal,
  Network,
  PenLine,
  Plus,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import './assets/main.css'

type Note = NoteRecord
const initialNotes: Note[] = [
  {
    id: 'design',
    title: '产品设计思考',
    originalTitle: '产品设计思考',
    date: '今天 10:24',
    tags: ['产品', '设计', '方法论'],
    kind: 'map',
    folder: '工作项目 / LiftInk / 交互设计',
    summary: '用户洞察、设计思维、原型迭代与验证反馈',
    favorite: true
  },
  {
    id: 'brain',
    title: '神经科学 · 阅读笔记',
    originalTitle: '神经科学 · 阅读笔记',
    date: '昨天 19:08',
    tags: ['研究', '阅读'],
    kind: 'brain',
    folder: '阅读摘录 / 神经科学',
    summary: '关于记忆、情绪与注意力的阅读摘录',
    favorite: false
  },
  {
    id: 'plan',
    title: '项目迭代规划',
    originalTitle: '项目迭代规划',
    date: '1 月 19 日',
    tags: ['产品', '效率', 'PDF'],
    kind: 'plan',
    folder: '工作项目 / 产品规划',
    summary: '产品版本节奏、页面草图与方案评审',
    favorite: false
  },
  {
    id: 'travel',
    title: '旅行灵感 · 云南',
    originalTitle: '旅行灵感 · 云南',
    date: '1 月 18 日',
    tags: ['灵感', '旅行'],
    kind: 'landscape',
    folder: '灵感收集 / 旅行手记',
    summary: '山间光线、旅行速写与风景配色',
    favorite: false
  }
]
type FolderNode = { name: string; children?: FolderNode[] }
const folderTree: FolderNode[] = [
  { name: '未分类' },
  { name: '课程笔记', children: [{ name: '设计基础' }, { name: '课堂速记' }] },
  {
    name: '工作项目',
    children: [
      { name: 'LiftInk', children: [{ name: '交互设计' }, { name: '视觉研究' }] },
      { name: '产品规划' }
    ]
  },
  { name: '阅读摘录', children: [{ name: '神经科学' }, { name: '阅读清单' }] },
  { name: '灵感收集', children: [{ name: '旅行手记' }, { name: '视觉素材' }] },
  { name: '个人', children: [{ name: '随笔' }] }
]
const flattenFolders = (nodes: FolderNode[], parent = ''): string[] =>
  nodes.flatMap((node) => {
    const path = parent ? `${parent} / ${node.name}` : node.name
    return [path, ...flattenFolders(node.children ?? [], path)]
  })
const folders = flattenFolders(folderTree)
type AgendaItem = {
  id: string
  date: string
  time: string
  title: string
  color: string
  done: boolean
}
const initialAgenda: AgendaItem[] = [
  {
    id: 'meeting',
    date: '2025-01-21',
    time: '10:00',
    title: '项目周会',
    color: '#5b92ff',
    done: false
  },
  {
    id: 'review',
    date: '2025-01-21',
    time: '14:30',
    title: '原型方案评审',
    color: '#ffb53e',
    done: false
  },
  {
    id: 'reading',
    date: '2025-01-21',
    time: '18:00',
    title: '阅读 ·《设计心理学》',
    color: '#f8d36d',
    done: false
  }
]
type SearchResult = {
  id: string
  title: string
  kind: 'note' | 'pdf' | 'image'
  folder: string
  summary: string
}
const mockPdfs: SearchResult[] = [
  {
    id: 'pdf-design',
    title: '设计心理学.pdf',
    kind: 'pdf',
    folder: '阅读摘录',
    summary: '交互设计、认知负荷与可用性'
  },
  {
    id: 'pdf-plan',
    title: '产品方案评审.pdf',
    kind: 'pdf',
    folder: '工作项目',
    summary: '项目目标、用户需求与页面草图'
  }
]
type Keyword = {
  text: string
  x: number
  y: number
  size: number
  tone: 'core' | 'secondary' | 'auxiliary'
  daysAgo: number
  latest: string
  relatedTitles: string[]
}
const keywords: Keyword[] = [
  {
    text: '产品',
    x: 48,
    y: 50,
    size: 30,
    tone: 'core',
    daysAgo: 1,
    latest: '1 月 20 日',
    relatedTitles: ['产品设计思考', '项目迭代规划']
  },
  {
    text: '设计灵感',
    x: 26,
    y: 22,
    size: 22,
    tone: 'core',
    daysAgo: 2,
    latest: '1 月 19 日',
    relatedTitles: ['产品设计思考', '旅行灵感 · 云南']
  },
  {
    text: '研究',
    x: 78,
    y: 24,
    size: 21,
    tone: 'secondary',
    daysAgo: 4,
    latest: '1 月 17 日',
    relatedTitles: ['神经科学 · 阅读笔记']
  },
  {
    text: '方法论',
    x: 20,
    y: 63,
    size: 19,
    tone: 'secondary',
    daysAgo: 5,
    latest: '1 月 16 日',
    relatedTitles: ['产品设计思考']
  },
  {
    text: '阅读',
    x: 73,
    y: 70,
    size: 20,
    tone: 'secondary',
    daysAgo: 3,
    latest: '1 月 18 日',
    relatedTitles: ['神经科学 · 阅读笔记']
  },
  {
    text: '用户洞察',
    x: 45,
    y: 81,
    size: 16,
    tone: 'auxiliary',
    daysAgo: 7,
    latest: '1 月 14 日',
    relatedTitles: ['产品设计思考']
  },
  {
    text: '效率',
    x: 84,
    y: 50,
    size: 16,
    tone: 'auxiliary',
    daysAgo: 8,
    latest: '1 月 13 日',
    relatedTitles: ['项目迭代规划']
  },
  {
    text: '复盘',
    x: 6,
    y: 35,
    size: 15,
    tone: 'auxiliary',
    daysAgo: 12,
    latest: '1 月 9 日',
    relatedTitles: ['项目迭代规划']
  },
  {
    text: '旅行',
    x: 15,
    y: 85,
    size: 15,
    tone: 'auxiliary',
    daysAgo: 15,
    latest: '1 月 6 日',
    relatedTitles: ['旅行灵感 · 云南']
  },
  {
    text: '原型',
    x: 64,
    y: 11,
    size: 14,
    tone: 'auxiliary',
    daysAgo: 24,
    latest: '12 月 28 日',
    relatedTitles: ['项目迭代规划']
  },
  {
    text: '灵感',
    x: 92,
    y: 10,
    size: 13,
    tone: 'auxiliary',
    daysAgo: 18,
    latest: '1 月 3 日',
    relatedTitles: ['旅行灵感 · 云南']
  },
  {
    text: '笔触',
    x: 61,
    y: 89,
    size: 13,
    tone: 'auxiliary',
    daysAgo: 22,
    latest: '12 月 30 日',
    relatedTitles: ['产品设计思考']
  },
  {
    text: '思考',
    x: 31,
    y: 96,
    size: 14,
    tone: 'auxiliary',
    daysAgo: 42,
    latest: '12 月 10 日',
    relatedTitles: ['产品设计思考']
  },
  {
    text: '记录',
    x: 7,
    y: 9,
    size: 13,
    tone: 'auxiliary',
    daysAgo: 68,
    latest: '11 月 14 日',
    relatedTitles: ['神经科学 · 阅读笔记']
  }
]

function Thumb({ kind }: { kind: string }): React.JSX.Element {
  if (kind === 'blank') return <div className="thumb blank-thumb" aria-hidden="true" />
  if (kind === 'landscape')
    return (
      <div className="thumb landscape">
        <div className="land-sun" />
        <div className="land-mountain far" />
        <div className="land-mountain near" />
        <div className="land-water" />
      </div>
    )
  if (kind === 'brain')
    return (
      <div className="thumb paper brain">
        <div className="scribble">the idea of a beautiful mind</div>
        <svg viewBox="0 0 250 125" aria-hidden="true">
          <path
            d="M95 83c-30-5-37-25-24-39 3-22 28-30 42-17 19-11 41 3 39 24 22 20 5 38-21 37-4 14-25 17-32 0Z"
            fill="none"
            stroke="#46414d"
            strokeWidth="2"
          />
          <path
            d="M73 49c13 9 25 0 22-17m18-5c-9 14 4 25 19 20m-13 4c-15 2-22 14-16 31m-24-20c12-7 18 4 16 15m34-21c-1 12 10 16 23 14"
            fill="none"
            stroke="#6d6974"
            strokeWidth="1.5"
          />
          <path
            d="M54 42 27 32m42 45-37 10m124-54 40-17m-41 57 45 13m-78 4 5 28"
            stroke="#9b95a5"
          />
          <g fill="#77717e" fontSize="8">
            <text x="3" y="28">
              memory
            </text>
            <text x="4" y="91">
              emotion
            </text>
            <text x="195" y="19">
              focus
            </text>
            <text x="199" y="90">
              ideas
            </text>
          </g>
        </svg>
      </div>
    )
  if (kind === 'plan')
    return (
      <div className="thumb paper plan">
        <div className="sketch-row">
          <span />
          <span />
          <span />
        </div>
        <div className="sketch-lines">
          ──── ───── ────
          <br />
          ────── ─── ─────
        </div>
        <div className="sketch-row bottom">
          <span />
          <span />
        </div>
      </div>
    )
  return (
    <div className="thumb paper map">
      <div className="map-title">产品设计思考 ✦</div>
      <div className="map-node center">设计思维</div>
      <div className="map-node a">用户洞察</div>
      <div className="map-node b">探索定义</div>
      <div className="map-node c">原型迭代</div>
      <div className="map-node d">验证反馈</div>
      <svg viewBox="0 0 260 140" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M130 75 56 50M130 75l76-27M130 75 55 112M130 75l78 36"
          stroke="#9c85e9"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    </div>
  )
}

function App(): React.JSX.Element {
  type Screen = 'home' | 'recent' | 'editor' | 'tags' | 'agenda' | 'quick' | 'pen-poc'
  const [screen, setScreen] = useState<Screen>('home')
  const [editorReturn, setEditorReturn] = useState<Screen>('home')
  const [quickKind, setQuickKind] = useState<QuickKind>('import')
  const [quickReturn, setQuickReturn] = useState<Screen>('home')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [notes, setNotes] = useState(initialNotes)
  const [notesReady, setNotesReady] = useState(false)
  const [indexSaveError, setIndexSaveError] = useState(false)
  const [indexLoadError, setIndexLoadError] = useState(false)
  const [importedFiles, setImportedFiles] = useState<(SearchResult & { date: string })[]>([])
  const [agendaItems, setAgendaItems] = useState(initialAgenda)
  const [query, setQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [searchIndex, setSearchIndex] = useState(0),
    [folderOpen, setFolderOpen] = useState(true),
    [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set()),
    [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedNav, setSelectedNav] = useState('Home'),
    [monthOffset, setMonthOffset] = useState(0),
    [selectedDay, setSelectedDay] = useState(21)
  const [modal, setModal] = useState<string | null>(null),
    [moreOpen, setMoreOpen] = useState(false)
  const [scheduleWidth, setScheduleWidth] = useState(window.innerWidth <= 1400 ? 260 : 300),
    [toast, setToast] = useState(''),
    [goals, setGoals] = useState([true, true, false])
  const [keywordPeriod, setKeywordPeriod] = useState<7 | 30 | 90>(30),
    [activeKeyword, setActiveKeyword] = useState<Keyword | null>(null)
  const [cardMenu, setCardMenu] = useState<string | null>(null),
    [operationNoteId, setOperationNoteId] = useState<string | null>(null),
    [draftTitle, setDraftTitle] = useState(''),
    [moveTarget, setMoveTarget] = useState(folders[0])
  const [agendaDraft, setAgendaDraft] = useState({ id: '', time: '09:00', title: '' })
  const [chartPeriod, setChartPeriod] = useState<7 | 30 | 90>(30),
    [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.liftInk
      .loadNoteIndex()
      .then(({ value, recovered }) => {
        if (cancelled) return
        if (value) setNotes(value)
        if (recovered) setToast('笔记目录已从备份恢复，请核对最近的修改')
        setIndexLoadError(false)
        setNotesReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setIndexLoadError(true)
          setToast('读取本地笔记目录失败，已阻止覆盖原文件')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    if (notesReady)
      void window.liftInk.saveNoteIndex(notes).then(
        () => setIndexSaveError(false),
        () => {
          setIndexSaveError(true)
          setToast('笔记目录保存失败')
        }
      )
  }, [notes, notesReady])
  const month = new Date(2025, monthOffset, 1),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    firstWeekday = (month.getDay() + 6) % 7
  const selectedDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
  const dayAgenda = agendaItems
    .filter((item) => item.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const filtered = useMemo(
    () =>
      notes.filter(
        (n) =>
          !n.trashed &&
          `${n.title} ${n.tags.join(' ')} ${n.folder} ${n.summary} 笔记`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!selectedFolder ||
            n.folder === selectedFolder ||
            n.folder.startsWith(`${selectedFolder} / `)) &&
          (selectedNav !== '常用文件' || n.favorite)
      ),
    [notes, query, selectedFolder, selectedNav]
  )
  const searchResults = useMemo(() => {
    const items: SearchResult[] = [
      ...notes
        .filter((note) => !note.trashed)
        .map((note) => ({
          id: note.id,
          title: note.title,
          kind: 'note' as const,
          folder: note.folder,
          summary: `${note.summary} · ${note.tags.join(' / ')}`
        })),
      ...mockPdfs,
      ...importedFiles
    ]
    const term = query.trim().toLowerCase()
    return (
      term
        ? items.filter((item) =>
            `${item.title} ${item.folder} ${item.summary}`.toLowerCase().includes(term)
          )
        : items
    ).slice(0, 6)
  }, [notes, query, importedFiles])
  const chartValues =
    chartPeriod === 7
      ? [5, 7, 4, 8, 6, 9, 10]
      : chartPeriod === 30
        ? [3, 5, 4, 8, 5, 9, 7, 10]
        : [4, 7, 5, 6, 8, 6, 9, 10]
  const chartDates = chartValues.map((_, index) => {
    const date = new Date(
      2025,
      0,
      22 - chartPeriod + Math.round((index * (chartPeriod - 1)) / (chartValues.length - 1))
    )
    return `${date.getMonth() + 1}/${date.getDate()}`
  })
  const chartPoints = chartValues.map((value, index) => ({
    x: 5 + (index * 510) / (chartValues.length - 1),
    y: 118 - value * 9
  }))
  const chartLine = `M${chartPoints[0].x} ${chartPoints[0].y} ${chartPoints
    .slice(1)
    .map((point, index) => {
      const previous = chartPoints[index]
      const before = chartPoints[Math.max(0, index - 1)]
      const after = chartPoints[Math.min(chartPoints.length - 1, index + 2)]
      return `C${previous.x + (point.x - before.x) / 6} ${previous.y + (point.y - before.y) / 6} ${point.x - (after.x - previous.x) / 6} ${point.y - (after.y - previous.y) / 6} ${point.x} ${point.y}`
    })
    .join(' ')}`
  const keywordNotes = (keyword: Keyword): Note[] =>
    notes.filter((note) => !note.trashed && keyword.relatedTitles.includes(note.originalTitle))
  const activeKeywordNotes = activeKeyword ? keywordNotes(activeKeyword) : []
  const activeNote = notes.find((note) => note.id === activeNoteId && !note.trashed) ?? null
  const openNote = (note: Note): void => {
    if (note.workspace) {
      setQuickKind(note.workspace)
      setQuickReturn(screen === 'recent' || screen === 'tags' ? screen : 'home')
      setActiveNoteId(note.id)
      setScreen('quick')
      return
    }
    setEditorReturn(screen === 'recent' || screen === 'tags' ? screen : 'home')
    setActiveNoteId(note.id)
    setSearchOpen(false)
    setScreen('editor')
  }
  const createNote = useCallback((): void => {
    if (!notesReady) {
      setToast('笔记目录仍在加载，暂时无法新建')
      return
    }
    const id = crypto.randomUUID()
    const note: Note = {
      id,
      title: '未命名笔记',
      originalTitle: `new-${id}`,
      date: '刚刚',
      tags: [],
      kind: 'blank',
      folder: '未分类',
      summary: '空白笔记',
      favorite: false
    }
    setNotes((current) => [note, ...current])
    setEditorReturn(screen === 'recent' || screen === 'tags' ? screen : 'home')
    setActiveNoteId(id)
    setModal(null)
    setScreen('editor')
  }, [screen, notesReady])
  const saveQuickNote = (
    title: string,
    kind: 'voice' | 'map' | 'board',
    summary: string,
    draft: QuickDraft
  ): void => {
    const workspace = kind === 'map' ? 'mindmap' : kind === 'board' ? 'whiteboard' : 'voice'
    if (activeNoteId) updateNote(activeNoteId, { title, summary, draft })
    else {
      const id = crypto.randomUUID()
      const note: Note = {
        id,
        title,
        originalTitle: `new-${id}`,
        date: '刚刚',
        tags: [],
        kind,
        workspace,
        draft,
        folder: '未分类',
        summary,
        favorite: false
      }
      setNotes((current) => [note, ...current])
    }
    setSelectedFolder(null)
    setActiveNoteId(null)
    setScreen('recent')
    setToast('草稿已保存到最近文件')
  }
  const toggleFolder = (path: string): void => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  useEffect(() => {
    const resize = (): void => setScheduleWidth(window.innerWidth <= 1400 ? 260 : 300)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (!toast || indexSaveError || indexLoadError) return
    const id = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(id)
  }, [toast, indexSaveError, indexLoadError])
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search-box input')?.focus()
        setSearchOpen(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        createNote()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNote])
  useEffect(() => {
    const closeSearch = (event: PointerEvent): void => {
      if (!(event.target as HTMLElement).closest('.search-wrap')) setSearchOpen(false)
    }
    document.addEventListener('pointerdown', closeSearch)
    return () => document.removeEventListener('pointerdown', closeSearch)
  }, [])
  const notifyDemo = (label: string): void => setToast(`${label} · 仅 Demo 演示`)
  const openSearchResult = (result: SearchResult): void => {
    setSearchOpen(false)
    if (result.kind === 'note') {
      const note = notes.find((entry) => entry.id === result.id)
      if (note) openNote(note)
    } else notifyDemo(`${result.title} · 内容预览尚未接入`)
  }
  const updateNote = (id: string, patch: Partial<Note>): void => {
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, ...patch } : note)))
  }
  const openNoteOperation = (note: Note, action: '重命名笔记' | '移动笔记'): void => {
    setOperationNoteId(note.id)
    setDraftTitle(note.title)
    setMoveTarget(note.folder)
    setCardMenu(null)
    setModal(action)
  }
  const openAgendaForm = (item?: AgendaItem): void => {
    setAgendaDraft(
      item
        ? { id: item.id, time: item.time, title: item.title }
        : { id: '', time: '09:00', title: '' }
    )
    setModal(item ? '修改日程' : '新增日程')
  }
  const startResize = (e: React.PointerEvent): void => {
    e.preventDefault()
    const x = e.clientX,
      w = scheduleWidth
    const move = (event: PointerEvent): void =>
      setScheduleWidth(Math.max(260, Math.min(390, w - (event.clientX - x))))
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  const renderFolder = (node: FolderNode, parent = '', depth = 0): React.JSX.Element => {
    const path = parent ? `${parent} / ${node.name}` : node.name
    const expanded = expandedFolders.has(path)
    const hasChildren = !!node.children?.length
    return (
      <div className="folder-branch" key={path}>
        <div className="folder-row" style={{ paddingLeft: depth * 13 }}>
          {hasChildren ? (
            <button
              className={`folder-toggle ${expanded ? 'expanded' : ''}`}
              aria-label={`${expanded ? '收起' : '展开'} ${path}`}
              aria-expanded={expanded}
              onClick={() => toggleFolder(path)}
            >
              <ChevronRight size={16} />
            </button>
          ) : (
            <span className="folder-spacer" />
          )}
          <button
            className={`folder-item ${selectedFolder === path ? 'selected' : ''}`}
            onClick={() => {
              setSelectedFolder(path)
              setSelectedNav('文件目录')
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const id = event.dataTransfer.getData('application/x-liftink-note')
              if (notes.some((note) => note.id === id)) {
                updateNote(id, { folder: path })
                setToast(`已移至「${path}」· 本次演示有效`)
              }
            }}
          >
            {expanded || selectedFolder === path ? <FolderOpen size={19} /> : <Folder size={19} />}
            <span>{node.name}</span>
          </button>
        </div>
        {hasChildren && expanded && (
          <div className="folder-children">
            {node.children!.map((child) => renderFolder(child, path, depth + 1))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div
      className={`app-shell view-${screen}`}
      style={{ '--schedule-width': `${scheduleWidth}px` } as React.CSSProperties}
    >
      <div className="mountain-backdrop" aria-hidden="true" />
      <aside className="navigation">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <div className="brand" aria-label="LiftInk 仰墨">
          <PenLine size={33} />
          <strong>LiftInk</strong>
        </div>
        <nav className="nav-links" aria-label="主导航">
          {[
            [Home, 'Home'],
            [Star, '常用文件'],
            [Tag, 'Tags']
          ].map(([Icon, label]) => (
            <button
              key={label as string}
              className={`nav-item ${screen !== 'editor' && selectedNav === label ? 'active' : ''}`}
              onClick={() => {
                setSelectedNav(label as string)
                setSelectedFolder(null)
                setScreen(label === 'Tags' ? 'tags' : 'home')
                setActiveNoteId(null)
              }}
            >
              <Icon size={22} />
              {label as string}
            </button>
          ))}
          <button className="nav-item folder-heading" onClick={() => setFolderOpen(!folderOpen)}>
            <ChevronDown size={16} className={folderOpen ? '' : 'closed'} />
            <Folder size={22} />
            文件目录
          </button>
          {folderOpen && (
            <div className="folder-list">{folderTree.map((node) => renderFolder(node))}</div>
          )}
        </nav>
        <button
          className="nav-item settings"
          onClick={() => {
            setSelectedNav('Settings')
            notifyDemo('Settings')
          }}
        >
          <Settings size={22} />
          Settings
        </button>
      </aside>
      <header className="brand-header">
        <em>Lift your head. Ink your mind.</em>
        <span className="slogan-cn">抬头落墨，平视成章。</span>
        <div className="header-spacer" />
        <button aria-label="通知" className="icon-button" onClick={() => notifyDemo('通知')}>
          <Bell size={23} />
          <i className="notification-dot" />
        </button>
        <button aria-label="账户" className="avatar" onClick={() => notifyDemo('账户')}>
          <UserRound size={22} />
        </button>
      </header>
      <main className="workspace">
        {screen === 'home' ? (
          <div className="content-area">
            <div className="search-wrap">
              <label className="search-box glass">
                <Search size={23} />
                <input
                  placeholder="搜索笔记、PDF、关键词..."
                  value={query}
                  onFocus={() => {
                    setSearchOpen(true)
                    setSearchIndex(0)
                  }}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSearchIndex(0)
                    setSearchOpen(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSearchIndex((index) => Math.min(index + 1, searchResults.length - 1))
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSearchIndex((index) => Math.max(index - 1, 0))
                    }
                    if (e.key === 'Enter' && searchResults[searchIndex]) {
                      e.preventDefault()
                      openSearchResult(searchResults[searchIndex])
                    }
                    if (e.key === 'Escape') {
                      setSearchOpen(false)
                      e.currentTarget.blur()
                    }
                  }}
                  aria-label="搜索笔记、PDF、关键词"
                  aria-controls="search-results"
                  aria-expanded={searchOpen && !!query.trim()}
                  aria-activedescendant={
                    searchOpen && query.trim() && searchResults[searchIndex]
                      ? `search-${searchResults[searchIndex].id}`
                      : undefined
                  }
                />
                <kbd>{navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'} K</kbd>
              </label>
              {searchOpen && !!query.trim() && (
                <div
                  className="search-results glass"
                  id="search-results"
                  role="listbox"
                  aria-label="搜索结果"
                >
                  <div className="search-caption">
                    {query.trim() ? `搜索结果 · ${searchResults.length}` : '最近项目'}
                  </div>
                  {searchResults.length ? (
                    searchResults.map((result, index) => (
                      <button
                        id={`search-${result.id}`}
                        role="option"
                        aria-selected={index === searchIndex}
                        className={index === searchIndex ? 'selected' : ''}
                        key={result.id}
                        onMouseEnter={() => setSearchIndex(index)}
                        onClick={() => openSearchResult(result)}
                      >
                        {result.kind === 'pdf' ? <FileText size={18} /> : <PenLine size={18} />}
                        <span>
                          <strong>{result.title}</strong>
                          <small>
                            {result.folder} · {result.summary}
                          </small>
                        </span>
                        <em>{result.kind === 'pdf' ? 'PDF' : '笔记'}</em>
                      </button>
                    ))
                  ) : (
                    <div className="search-empty">没有找到匹配的笔记或 PDF</div>
                  )}
                  <div className="search-hint">↑ ↓ 选择 · Enter 打开 · Esc 关闭</div>
                </div>
              )}
            </div>
            <div className="quick-actions">
              <button className="new-note" onClick={createNote}>
                <PenLine size={32} />
                <span>
                  <strong>新建笔记</strong>
                  <small>自由书写 / 手写识别 / 批注</small>
                </span>
                <Plus size={25} />
              </button>
              {[
                [Mic, '语音速记'],
                [FileImage, '导入 PDF/图片'],
                [Network, '新建思维导图'],
                [Maximize2, '新建白板']
              ].map(([Icon, label]) => (
                <button
                  className="quick-button glass"
                  key={label as string}
                  onClick={() => {
                    setActiveNoteId(null)
                    setQuickReturn('home')
                    setQuickKind(
                      label === '语音速记'
                        ? 'voice'
                        : label === '导入 PDF/图片'
                          ? 'import'
                          : label === '新建思维导图'
                            ? 'mindmap'
                            : 'whiteboard'
                    )
                    setScreen('quick')
                  }}
                >
                  <Icon size={27} />
                  <b>{label as string}</b>
                </button>
              ))}
              <div className="more-wrap">
                <button
                  className="quick-button glass more-button"
                  aria-label="更多操作"
                  onClick={() => setMoreOpen(!moreOpen)}
                >
                  <MoreHorizontal size={24} />
                </button>
                {moreOpen && (
                  <div className="more-menu glass">
                    {['新建思维导图', '新建白板'].map((label) => (
                      <button
                        key={label}
                        onClick={() => {
                          setActiveNoteId(null)
                          setQuickReturn('home')
                          setQuickKind(label === '新建思维导图' ? 'mindmap' : 'whiteboard')
                          setScreen('quick')
                          setMoreOpen(false)
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <section className="recent glass">
              <div className="panel-title">
                <h2>
                  最近笔记 <ChevronRight size={20} />
                </h2>
                <button
                  onClick={() => {
                    setSelectedFolder(null)
                    setQuery('')
                    setSelectedNav('Home')
                    setScreen('recent')
                  }}
                >
                  查看全部 <ChevronRight size={18} />
                </button>
              </div>
              <div className="note-grid">
                {filtered.length ? (
                  filtered.slice(0, 4).map((note) => (
                    <div
                      className="note-tile"
                      key={note.id}
                      draggable
                      onDragStart={(event) =>
                        event.dataTransfer.setData('application/x-liftink-note', note.id)
                      }
                    >
                      <button className="note-card" onClick={() => openNote(note)}>
                        <Thumb kind={note.kind} />
                        <strong>{note.title}</strong>
                        <span>{note.date}</span>
                      </button>
                      <div className="note-actions">
                        <button
                          aria-label={`${note.favorite ? '取消收藏' : '收藏'} ${note.title}`}
                          className={note.favorite ? 'favorited' : ''}
                          onClick={() => updateNote(note.id, { favorite: !note.favorite })}
                        >
                          <Star size={15} fill={note.favorite ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          aria-label={`${note.title} 更多操作`}
                          onClick={() => setCardMenu(cardMenu === note.id ? null : note.id)}
                        >
                          <MoreHorizontal size={17} />
                        </button>
                      </div>
                      {cardMenu === note.id && (
                        <div className="note-menu glass">
                          <button onClick={() => openNoteOperation(note, '重命名笔记')}>
                            重命名
                          </button>
                          <button
                            onClick={() => {
                              updateNote(note.id, { favorite: !note.favorite })
                              setCardMenu(null)
                            }}
                          >
                            {note.favorite ? '取消收藏' : '收藏'}
                          </button>
                          <button onClick={() => openNoteOperation(note, '移动笔记')}>
                            移动到
                          </button>
                          <button
                            onClick={() => {
                              updateNote(note.id, { trashed: true })
                              setCardMenu(null)
                              setToast('已移入回收站 · 本次演示有效')
                            }}
                          >
                            <Trash2 size={14} /> 移入回收站
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-notes">未找到匹配笔记。试试其他关键词或目录。</div>
                )}
              </div>
            </section>
            <div className="bottom-grid">
              <section className="stats glass">
                <div className="panel-title stats-heading">
                  <h2>书写概览</h2>
                  <div className="stat-periods" aria-label="书写趋势时间范围">
                    {([7, 30, 90] as const).map((period) => (
                      <button
                        key={period}
                        className={chartPeriod === period ? 'selected' : ''}
                        aria-pressed={chartPeriod === period}
                        onClick={() => {
                          setChartPeriod(period)
                          setHoveredPoint(null)
                        }}
                      >
                        {period} 天
                      </button>
                    ))}
                  </div>
                </div>
                <div className="stat-values">
                  <div>
                    <FileText size={29} />
                    <strong>
                      126 <small>篇</small>
                    </strong>
                    <span>笔记总数</span>
                  </div>
                  <div>
                    <Flame size={32} />
                    <strong>
                      12 <small>天</small>
                    </strong>
                    <span>连续书写</span>
                  </div>
                  <div>
                    <PenLine size={32} />
                    <strong>
                      842 <small>页</small>
                    </strong>
                    <span>累计书写页数</span>
                  </div>
                </div>
                <div className="chart">
                  <svg
                    viewBox="0 0 520 130"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label={`近 ${chartPeriod} 天书写趋势折线图`}
                  >
                    <defs>
                      <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                        <stop stopColor="#8d74f6" stopOpacity=".32" />
                        <stop offset="1" stopColor="#8d74f6" stopOpacity=".02" />
                      </linearGradient>
                    </defs>
                    <path d={`${chartLine} L515 128 L5 128Z`} fill="url(#area)" />
                    <path d={chartLine} fill="none" stroke="#8066ff" strokeWidth="2.5" />
                    {chartPoints.map(({ x, y }, index) => (
                      <circle
                        key={index}
                        cx={x}
                        cy={y}
                        r="3.3"
                        fill="white"
                        stroke="#8066ff"
                        strokeWidth="2"
                        tabIndex={0}
                        aria-label={`${chartDates[index]}，书写 ${chartValues[index]} 页`}
                        onMouseEnter={() => setHoveredPoint(index)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onFocus={() => setHoveredPoint(index)}
                        onBlur={() => setHoveredPoint(null)}
                      >
                        <title>
                          {chartDates[index]} · 书写 {chartValues[index]} 页
                        </title>
                      </circle>
                    ))}
                  </svg>
                  {hoveredPoint !== null && (
                    <div
                      className="chart-tooltip"
                      style={{ left: `${(chartPoints[hoveredPoint].x / 520) * 100}%` }}
                    >
                      {chartDates[hoveredPoint]} · 书写 {chartValues[hoveredPoint]} 页
                    </div>
                  )}
                  <div className="chart-labels">
                    {(chartPeriod === 7
                      ? ['1/15', '1/17', '1/19', '1/21']
                      : chartPeriod === 30
                        ? ['12/22', '12/29', '1/5', '1/12', '1/19']
                        : ['10/22', '11/12', '12/3', '12/24', '1/21']
                    ).map((label) => (
                      <span key={label}>{label}</span>
                    ))}
                  </div>
                </div>
              </section>
              <section className="keywords glass">
                <div className="panel-title keyword-heading">
                  <h2>
                    思绪拾光 <small>最近笔记关键词</small>
                  </h2>
                  <div className="keyword-periods" aria-label="关键词时间范围">
                    {([7, 30, 90] as const).map((period) => (
                      <button
                        key={period}
                        className={keywordPeriod === period ? 'selected' : ''}
                        aria-pressed={keywordPeriod === period}
                        onClick={() => {
                          setKeywordPeriod(period)
                          setActiveKeyword(null)
                        }}
                      >
                        {period} 天
                      </button>
                    ))}
                  </div>
                </div>
                {activeKeyword ? (
                  <div className="keyword-results">
                    <button className="keyword-back" onClick={() => setActiveKeyword(null)}>
                      <ChevronLeft size={16} /> 返回词云
                    </button>
                    <p>
                      「{activeKeyword.text}」关联 {activeKeywordNotes.length} 篇笔记
                    </p>
                    <div>
                      {activeKeywordNotes.map((note) => (
                        <button key={note.id} onClick={() => openNote(note)}>
                          <FileText size={16} /> {note.title} <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="word-cloud" aria-label={`最近 ${keywordPeriod} 天关键词`}>
                    {keywords
                      .filter(
                        (keyword) =>
                          keyword.daysAgo <= keywordPeriod && keywordNotes(keyword).length
                      )
                      .map((keyword) => (
                        <button
                          key={keyword.text}
                          className={`word ${keyword.tone}`}
                          style={{
                            left: `${keyword.x}%`,
                            top: `${keyword.y}%`,
                            fontSize: keyword.size
                          }}
                          title={`出现 ${keyword.relatedTitles.length * 3} 次 · 关联 ${keywordNotes(keyword).length} 篇笔记 · 最近记录于 ${keyword.latest}`}
                          onClick={() => setActiveKeyword(keyword)}
                        >
                          {keyword.text}
                        </button>
                      ))}
                  </div>
                )}
                <div className="keyword-footnote">点击关键词，回顾相关笔记</div>
              </section>
            </div>
          </div>
        ) : screen === 'recent' ? (
          <RecentFilesView
            files={[
              ...notes
                .filter(
                  (note) =>
                    !note.trashed &&
                    (!selectedFolder ||
                      note.folder === selectedFolder ||
                      note.folder.startsWith(`${selectedFolder} / `))
                )
                .map((note) => ({
                  id: note.id,
                  title: note.title,
                  kind: 'note' as const,
                  folder: note.folder,
                  date: note.date,
                  summary: note.summary,
                  favorite: note.favorite
                })),
              ...[...mockPdfs, ...importedFiles]
                .filter(
                  (file) =>
                    !selectedFolder ||
                    file.folder === selectedFolder ||
                    file.folder.startsWith(`${selectedFolder} / `)
                )
                .map((file) => ({
                  ...file,
                  date: 'date' in file && typeof file.date === 'string' ? file.date : '1 月 16 日',
                  favorite: false
                }))
            ]}
            onBack={() => {
              setScreen('home')
              setSelectedFolder(null)
              setSelectedNav('Home')
            }}
            onCreate={createNote}
            onOpen={(file) => {
              if (file.kind !== 'note') notifyDemo(`${file.title} · 内容预览尚未接入`)
              else {
                const note = notes.find((entry) => entry.id === file.id)
                if (note) openNote(note)
              }
            }}
          />
        ) : screen === 'tags' ? (
          <TagsView
            notes={notes.filter((note) => !note.trashed)}
            onBack={() => {
              setSelectedNav('Home')
              setScreen('home')
            }}
            onOpen={(id) => {
              const note = notes.find((entry) => entry.id === id)
              if (note) openNote(note)
            }}
          />
        ) : screen === 'agenda' ? (
          <AgendaView
            items={agendaItems}
            selectedDate={selectedDate}
            onBack={() => setScreen('home')}
            onSelectDate={(date) => {
              const [year, monthNumber, day] = date.split('-').map(Number)
              setMonthOffset((year - 2025) * 12 + monthNumber - 1)
              setSelectedDay(day)
            }}
            onToggle={(id) =>
              setAgendaItems((items) =>
                items.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
              )
            }
            onAdd={() => openAgendaForm()}
            onEdit={(item) => openAgendaForm(item)}
            onDelete={(id) => setAgendaItems((items) => items.filter((item) => item.id !== id))}
          />
        ) : screen === 'quick' ? (
          <QuickWorkspaceView
            key={`${quickKind}:${activeNoteId ?? 'new'}`}
            kind={quickKind}
            initialNote={activeNoteId ? notes.find((note) => note.id === activeNoteId) : undefined}
            onBack={() => {
              setScreen(quickReturn)
              setActiveNoteId(null)
            }}
            onSave={saveQuickNote}
            onImport={(files) => {
              setImportedFiles((current) => [
                ...files.map((file) => ({
                  id: crypto.randomUUID(),
                  title: file.name,
                  kind: file.kind,
                  folder: '未分类',
                  summary: '本次会话导入的文件信息',
                  date: '刚刚'
                })),
                ...current
              ])
              setScreen('recent')
              setToast(`已添加 ${files.length} 个文件到最近文件 · 本次会话有效`)
            }}
          />
        ) : screen === 'pen-poc' ? (
          <PenInputPocView onBack={() => setScreen('editor')} />
        ) : activeNote ? (
          <LiveNoteEditorView
            key={activeNote.id}
            note={activeNote}
            folders={folders}
            onBack={() => {
              setNotes((current) =>
                current.map((note) =>
                  note.id === activeNote.id && !note.title.trim()
                    ? { ...note, title: '未命名笔记' }
                    : note
                )
              )
              setScreen(editorReturn)
              setActiveNoteId(null)
            }}
            onTitleChange={(title) => updateNote(activeNote.id, { title })}
            onFolderChange={(folder) => updateNote(activeNote.id, { folder })}
            onOpenInputPoc={() => setScreen('pen-poc')}
          />
        ) : null}
      </main>
      {screen === 'home' && (
        <div
          className="resize-handle"
          role="separator"
          aria-label="调整日程栏宽度"
          onPointerDown={startResize}
        />
      )}
      {screen === 'home' && (
        <section className="middle-column glass" aria-label="日程侧栏">
          <div className="calendar-head">
            <button
              aria-label="回到今天"
              className="today-button"
              onClick={() => {
                setMonthOffset(0)
                setSelectedDay(21)
              }}
            >
              <CalendarDays size={15} /> 今天
            </button>
            <strong>
              {month.getFullYear()} 年 {month.getMonth() + 1} 月
            </strong>
            <div className="calendar-arrows">
              <button
                aria-label="上一月"
                onClick={() => {
                  setMonthOffset((v) => v - 1)
                  setSelectedDay(1)
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label="下一月"
                onClick={() => {
                  setMonthOffset((v) => v + 1)
                  setSelectedDay(1)
                }}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
              <span className="weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => (
              <button
                key={i}
                className={selectedDay === i + 1 ? 'selected-day' : ''}
                onClick={() => setSelectedDay(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="schedule">
            <div className="section-title">
              <h2>
                {selectedDay === 21 && monthOffset === 0
                  ? '今日日程'
                  : `${month.getMonth() + 1} 月 ${selectedDay} 日日程`}{' '}
                <span className="count">{dayAgenda.length}</span>
              </h2>
              <div className="schedule-actions">
                <button
                  aria-label="查看全部日程"
                  title="查看全部日程"
                  onClick={() => setScreen('agenda')}
                >
                  <MoreHorizontal size={21} />
                </button>
                <button aria-label="新增日程" onClick={() => openAgendaForm()}>
                  <Plus size={23} />
                </button>
              </div>
            </div>
            {dayAgenda.length ? (
              dayAgenda.map((item) => (
                <div className={`agenda-item ${item.done ? 'done' : ''}`} key={item.id}>
                  <i style={{ background: item.color }} />
                  <button
                    className="agenda-main"
                    aria-label={`${item.done ? '标记未完成' : '完成'} ${item.title}`}
                    onClick={() =>
                      setAgendaItems((items) =>
                        items.map((entry) =>
                          entry.id === item.id ? { ...entry, done: !entry.done } : entry
                        )
                      )
                    }
                  >
                    <span>{item.time}</span>
                    <b>{item.title}</b>
                  </button>
                  <button
                    className="agenda-edit"
                    aria-label={`修改 ${item.title}`}
                    onClick={() => openAgendaForm(item)}
                  >
                    ⋯
                  </button>
                  <button
                    className="agenda-delete"
                    aria-label={`删除 ${item.title}`}
                    onClick={() =>
                      setAgendaItems((items) => items.filter((entry) => entry.id !== item.id))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-day">这一天暂无日程</p>
            )}
          </div>
          <div className="goals">
            <div className="section-title">
              <h2>目标</h2>
              <span>{goals.filter(Boolean).length} / 3</span>
            </div>
            <div className="progress">
              <i style={{ width: `${(goals.filter(Boolean).length / 3) * 100}%` }} />
            </div>
            {['完成项目方案初稿', '整理课程笔记', '阅读 2 本书'].map((g, i) => (
              <button
                className="goal"
                key={g}
                onClick={() => setGoals((v) => v.map((x, j) => (j === i ? !x : x)))}
              >
                <span className={goals[i] ? 'checked' : ''}>{goals[i] && <Check size={17} />}</span>
                {g}
              </button>
            ))}
          </div>
        </section>
      )}

      <Dialog.Root
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) setModal(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content glass">
            <Dialog.Close className="dialog-close" aria-label="关闭">
              <X size={22} />
            </Dialog.Close>
            {modal === '重命名笔记' && operationNoteId ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (draftTitle.trim()) {
                    updateNote(operationNoteId, { title: draftTitle.trim() })
                    setModal(null)
                    setToast('笔记已重命名 · 本次演示有效')
                  }
                }}
              >
                <Dialog.Title>重命名笔记</Dialog.Title>
                <label className="form-field">
                  笔记标题
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    required
                  />
                </label>
                <button className="form-submit" type="submit">
                  保存名称
                </button>
              </form>
            ) : modal === '移动笔记' && operationNoteId ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  updateNote(operationNoteId, { folder: moveTarget })
                  setModal(null)
                  setToast(`已移至「${moveTarget}」· 本次演示有效`)
                }}
              >
                <Dialog.Title>移动笔记</Dialog.Title>
                <label className="form-field">
                  目标文件夹
                  <select
                    value={moveTarget}
                    onChange={(event) => setMoveTarget(event.target.value)}
                  >
                    {folders.map((folder) => (
                      <option key={folder}>{folder}</option>
                    ))}
                  </select>
                </label>
                <button className="form-submit" type="submit">
                  移动到此处
                </button>
              </form>
            ) : modal === '新增日程' || modal === '修改日程' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!agendaDraft.title.trim()) return
                  if (agendaDraft.id)
                    setAgendaItems((items) =>
                      items.map((item) =>
                        item.id === agendaDraft.id
                          ? { ...item, time: agendaDraft.time, title: agendaDraft.title.trim() }
                          : item
                      )
                    )
                  else
                    setAgendaItems((items) => [
                      ...items,
                      {
                        id: crypto.randomUUID(),
                        date: selectedDate,
                        time: agendaDraft.time,
                        title: agendaDraft.title.trim(),
                        color: '#8a75e8',
                        done: false
                      }
                    ])
                  setModal(null)
                }}
              >
                <Dialog.Title>{modal}</Dialog.Title>
                <label className="form-field">
                  时间
                  <input
                    type="time"
                    value={agendaDraft.time}
                    onChange={(event) =>
                      setAgendaDraft((draft) => ({ ...draft, time: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="form-field">
                  标题
                  <input
                    autoFocus
                    value={agendaDraft.title}
                    onChange={(event) =>
                      setAgendaDraft((draft) => ({ ...draft, title: event.target.value }))
                    }
                    placeholder="输入日程内容"
                    required
                  />
                </label>
                <button className="form-submit" type="submit">
                  {agendaDraft.id ? '保存修改' : '添加日程'}
                </button>
              </form>
            ) : (
              <>
                <Dialog.Title>{modal}</Dialog.Title>
                <p>
                  {modal === '新建笔记'
                    ? '空白画布与本地保存将在编辑器阶段接入。当前仅展示首页入口。'
                    : '该功能将在后续阶段接入。当前仅展示首页入口。'}
                </p>
                <div className="dialog-options">
                  <button onClick={() => setModal(null)}>知道了</button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {toast && (
        <div className="toast" role="status">
          {toast}
          {indexSaveError && (
            <button
              onClick={() =>
                void window.liftInk.saveNoteIndex(notes).then(
                  () => {
                    setIndexSaveError(false)
                    setToast('笔记目录已保存')
                  },
                  () => setToast('笔记目录保存失败，请检查应用数据目录')
                )
              }
            >
              重试保存
            </button>
          )}
        </div>
      )}
    </div>
  )
}
export default App
