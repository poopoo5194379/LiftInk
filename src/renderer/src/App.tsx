import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as Dialog from './components/ui/dialog'
import LibrarySettings, { type LocalProfile, type SettingsSection } from './components/LibrarySettings'
import { base64Of, makePortable, readPortable, restoreReferencedAssets, type PortableEntry } from './editor/portable'
import LiveNoteEditorView from './components/LiveNoteEditorView'
import { referencedAssets } from '../../shared/noteResources'
import { MAX_NOTE_PAGES, TRASH_RETENTION_MS } from '../../shared/editor'
import type { NoteDocument, NoteRecord } from '../../shared/editor'
import { dayKey, focusTotal, formatDuration, noteDate, noteDateDetail } from './editor/noteActivity'
import { importMarkdown, isMarkdownFile } from './editor/markdownImport'
import { flushEditorSaves } from './editor/autosave'
import { emptyDocument } from './editor/history'
import { isPdfFile, preparePdf } from './editor/pdfImport'
import { normalizePdfText } from './editor/pdfSearch'
import { matchesNoteSearch, readNoteContent, recentKeywords, type Keyword } from './editor/pdfLibrary'
import { imageDimensions, imageMime, storeImageFile } from './editor/imageAsset'
import RecentFilesView, { type RecentFile } from './components/RecentFilesView'
import TagsView from './components/TagsView'
import AgendaView from './components/AgendaView'
import MarkdownNoteEditor from './components/MarkdownNoteEditor'
import NotePageThumbnail from './components/NotePageThumbnail'
import QuickWorkspaceView, {
  type QuickDraft,
  type QuickKind
} from './components/QuickWorkspaceView'
import PenInputPocView from './components/PenInputPocView'
import NoteFileIcon from './components/NoteFileIcon'
import liftInkMark from './assets/liftink-mark.svg'
import { accentColors, legacyBrushPreferences, preferenceDefaults, preferenceKey, type Preferences } from './editor/preferences'
import { isVaultSetting, type VaultOperation } from '../../shared/vault'
import { flushVaultSettings, getVaultSetting, getVaultSettingEntries, setVaultSetting } from './editor/vaultSettings'
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
const closingFocusKey = 'liftink.focus-at-close'

function readClosingFocus(): Record<string, Record<string, number>> {
  try { return JSON.parse(localStorage.getItem(closingFocusKey) ?? '{}') }
  catch { return {} }
}
type Goal = { id: string; title: string; done: boolean; noteId?: string }
function useLocalValue<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = isVaultSetting(key) ? getVaultSetting(key) : localStorage.getItem(key)
      return stored ? JSON.parse(stored) as T : initial
    } catch { return initial }
  })
  useEffect(() => {
    const encoded = JSON.stringify(value)
    if (isVaultSetting(key)) setVaultSetting(key, encoded)
    else localStorage.setItem(key, encoded)
  }, [key, value])
  return [value, setValue]
}
type FolderNode = { name: string; children?: FolderNode[] }
type FolderAction = { kind: 'create'; parent: string } | { kind: 'rename'; path: string } | { kind: 'delete'; path: string }
const parentFolder = (path: string): string => path.split(' / ').slice(0, -1).join(' / ')
const starterTree: FolderNode[] = [
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
const starterFolders = flattenFolders(starterTree)
const folderPath = (path: string): string[] => path.split(' / ').map((part) => part.trim()).filter(Boolean)
function buildFolderTree(paths: string[]): FolderNode[] {
  const tree: FolderNode[] = []
  for (const path of paths) {
    let level = tree
    for (const name of folderPath(path)) {
      let node = level.find((entry) => entry.name === name)
      if (!node) { node = { name, children: [] }; level.push(node) }
      level = node.children!
    }
  }
  return tree
}
type AgendaItem = {
  id: string
  date: string
  time: string
  title: string
  color: string
  done: boolean
  noteId?: string
  goalId?: string
  minutes?: number
}
type SearchResult = {
  id: string
  title: string
  kind: 'note' | 'pdf' | 'image'
  folder: string
  summary: string
}
const keywordSlots = [
  [50, 50, 29], [26, 23, 22], [76, 23, 21], [20, 62, 19], [77, 70, 19], [47, 82, 16],
  [85, 46, 15], [10, 40, 15], [15, 85, 14], [54, 12, 14], [89, 9, 13], [67, 94, 13]
] as const

function readLibrarySettings(value: unknown): { folders: string[]; tagCatalog: string[]; agendaItems: AgendaItem[]; goals: Goal[]; profile: LocalProfile; blockedKeywords?: string[] } | undefined {
  if (value === undefined) return
  if (!value || typeof value !== 'object') throw new Error('资料库设置无效')
  const settings = value as NonNullable<ReturnType<typeof readLibrarySettings>>
  const strings = (items: unknown, length: number): items is string[] => Array.isArray(items) && items.length <= 10_000 && items.every((item) => typeof item === 'string' && item.length <= length)
  if (!strings(settings.folders, 800) || !strings(settings.tagCatalog, 10000) ||
      (settings.blockedKeywords !== undefined && !strings(settings.blockedKeywords, 10000)) ||
      !Array.isArray(settings.agendaItems) || !settings.agendaItems.every((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && typeof item.title === 'string' && typeof item.done === 'boolean' && typeof item.color === 'string' && typeof item.time === 'string') ||
      !Array.isArray(settings.goals) || !settings.goals.every((item) => item && typeof item.title === 'string' && typeof item.done === 'boolean') ||
      typeof settings.profile?.name !== 'string' || typeof settings.profile.reminders !== 'boolean') throw new Error('资料库设置无效')
  return settings
}

const calendarMonth = (date: Date): number => date.getFullYear() * 12 + date.getMonth()

function App(): React.JSX.Element {
  type Screen = 'home' | 'recent' | 'favorites' | 'folder' | 'editor' | 'tags' | 'agenda' | 'quick' | 'pen-poc' | 'trash' | 'focus' | 'settings'
  const [screen, setScreen] = useState<Screen>('home')
  const [settingsSection, setSettingsSection] = useState<SettingsSection>()
  const [storedPreferences, setPreferences] = useLocalValue<Partial<Preferences>>(preferenceKey, legacyBrushPreferences())
  const preferences = useMemo(() => ({ ...preferenceDefaults, ...storedPreferences }), [storedPreferences])
  const [lastBackup, setLastBackup] = useLocalValue<number>('liftink:last-backup', 0)
  const [lastSaved, setLastSaved] = useLocalValue<number>('liftink:last-saved', 0)
  const backupInProgress = useRef(false)
  const lastBackupAttempt = useRef(0)
  const openFileInput = useRef<HTMLInputElement>(null)
  const searchReturnFocus = useRef<HTMLElement | null>(null)
  const [editorReturn, setEditorReturn] = useState<Screen>('home')
  const [quickKind, setQuickKind] = useState<QuickKind>('import')
  const [quickReturn, setQuickReturn] = useState<Screen>('home')
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [initialPdfQuery, setInitialPdfQuery] = useState('')
  const [focusNoteId, setFocusNoteId] = useState<string>()
  const [draftNote, setDraftNote] = useState<Note | null>(null)
  const draftRef = useRef<Note | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [folderCatalog, setFolderCatalog] = useLocalValue<string[]>('liftink:folders', starterFolders)
  const [profile, setProfile] = useLocalValue<LocalProfile>('liftink:profile', { name: '', reminders: true })
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [vaultBusy, setVaultBusy] = useState(false)
  const libraryInput = useRef<HTMLInputElement>(null)
  const folderTree = useMemo(() => buildFolderTree(['未分类', ...folderCatalog, ...notes.map((note) => note.folder)]), [folderCatalog, notes])
  const folders = useMemo(() => flattenFolders(folderTree), [folderTree])
  const [notesReady, setNotesReady] = useState(false)
  const indexedPdfVersions = useRef(new Map<string, string>())
  const [pdfContents, setPdfContents] = useState(new Map<string, string[]>())
  const [noteContents, setNoteContents] = useState(new Map<string, string[]>())
  const [pdfIndexing, setPdfIndexing] = useState(false)
  const creatingNote = useRef(false)
  const [newNoteBusy, setNewNoteBusy] = useState(false)
  const readingShellPdf = useRef(false)
  const shellPdfNotified = useRef(false)
  const [homeDropActive, setHomeDropActive] = useState(false)
  const [pdfImportStatus, setPdfImportStatus] = useState('')
  const [trashUndoId, setTrashUndoId] = useState<string | null>(null)
  const [indexSaveError, setIndexSaveError] = useState(false)
  const [indexLoadError, setIndexLoadError] = useState(false)
  const [showAllGoals, setShowAllGoals] = useState(false)
  const [agendaItems, setAgendaItems] = useLocalValue<AgendaItem[]>('liftink:agenda', [])
  const [tagCatalog, setTagCatalog] = useLocalValue<string[]>('liftink:tags', [])
  const [blockedKeywords, setBlockedKeywords] = useLocalValue<string[]>('liftink:keyword-stopwords', [])
  const [keywordToBlock, setKeywordToBlock] = useState<string | null>(null)
  const [query, setQuery] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [globalSearchOpen, setGlobalSearchOpen] = useState(false),
    [searchIndex, setSearchIndex] = useState(0),
    [folderOpen, setFolderOpen] = useState(() => !preferences.rememberSidebar || localStorage.getItem('liftink:sidebar-open') !== 'false'),
    [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
      try { return new Set(preferences.rememberSidebar ? JSON.parse(localStorage.getItem('liftink:sidebar-folders') ?? '[]') : []) }
      catch { return new Set() }
    }),
    [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [folderMenu, setFolderMenu] = useState<string | null>(null)
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState('')
  const addFolderButton = useRef<HTMLButtonElement>(null)
  const folderActionTrigger = useRef<HTMLButtonElement | null>(null)
  const [selectedNav, setSelectedNav] = useState('首页'),
    [monthOffset, setMonthOffset] = useState(() => calendarMonth(new Date())),
    [selectedDay, setSelectedDay] = useState(() => new Date().getDate())
  const [monthDirection, setMonthDirection] = useState<'previous' | 'next' | null>(null)
  const [modal, setModal] = useState<string | null>(null),
    [moreOpen, setMoreOpen] = useState(false)
  const [scheduleWidth, setScheduleWidth] = useState(window.innerWidth <= 1400 ? 260 : 300),
    [toast, setToast] = useState('')
  const [goals, setGoals] = useLocalValue<Goal[]>('liftink:goals', [])
  const [goalDraft, setGoalDraft] = useState({ id: '', title: '', noteId: '' })
  const [activeAgendaId, setActiveAgendaId] = useState<string>()
  const [pendingAgendaDelete, setPendingAgendaDelete] = useState<AgendaItem | null>(null)
  const [keywordPeriod, setKeywordPeriod] = useState<7 | 30 | 90>(30),
    [activeKeyword, setActiveKeyword] = useState<Keyword | null>(null)
  const [cardMenu, setCardMenu] = useState<string | null>(null),
    [operationNoteId, setOperationNoteId] = useState<string | null>(null),
    [draftTitle, setDraftTitle] = useState(''),
    [moveTarget, setMoveTarget] = useState(folders[0])
  const [agendaDraft, setAgendaDraft] = useState({ id: '', time: '', title: '', noteId: '', goalId: '', minutes: '' })
  const [chartPeriod, setChartPeriod] = useState<7 | 30 | 90>(30),
    [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  useEffect(() => {
    const report = (): void => setToast('资料库配置保存失败，请检查存储目录')
    window.addEventListener('liftink-vault-save-error', report)
    return () => window.removeEventListener('liftink-vault-save-error', report)
  }, [])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => {
      document.documentElement.dataset.theme = preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme
      document.documentElement.style.setProperty('--liftink-accent', accentColors[preferences.accent])
    }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [preferences.theme, preferences.accent])
  useEffect(() => { void window.liftInk.applyWindowPreferences(preferences.scale, preferences.close === 'tray').catch(() => undefined) }, [preferences.scale, preferences.close])
  useEffect(() => {
    if (!preferences.rememberSidebar) return
    localStorage.setItem('liftink:sidebar-open', String(folderOpen))
    localStorage.setItem('liftink:sidebar-folders', JSON.stringify([...expandedFolders]))
  }, [folderOpen, expandedFolders, preferences.rememberSidebar])
  const restoreWorkspace = useEffectEvent((entries: Note[]) => {
    if (preferences.startup !== 'workspace') return
    const previous = localStorage.getItem('liftink:last-workspace')
    if (previous === 'recent' || previous === 'favorites' || previous === 'tags' || previous === 'agenda') {
      setScreen(previous)
      setSelectedNav(previous === 'tags' ? '标签' : previous === 'favorites' ? '常用文件' : '首页')
    } else if (previous === 'folder') {
      const folder = localStorage.getItem('liftink:last-folder')
      if (folder && (folderCatalog.includes(folder) || entries.some((note) => note.folder === folder))) {
        setSelectedFolder(folder)
        setSelectedNav(folder)
        setScreen('folder')
      }
    } else if ((previous === 'editor' || previous === 'quick') && preferences.restoreNote) {
      const id = localStorage.getItem('liftink:last-note')
      const note = entries.find((entry) => entry.id === id && !entry.trashed)
      if (note) openNote(note)
    }
  })
  useEffect(() => {
    if (!notesReady || !['home', 'recent', 'favorites', 'folder', 'tags', 'agenda', 'editor', 'quick'].includes(screen)) return
    const isNote = screen === 'editor' || screen === 'quick'
    if (isNote && (!activeNoteId || draftNote?.id === activeNoteId)) return
    localStorage.setItem('liftink:last-workspace', screen)
    if (isNote && activeNoteId) localStorage.setItem('liftink:last-note', activeNoteId)
    if (screen === 'folder' && selectedFolder) localStorage.setItem('liftink:last-folder', selectedFolder)
  }, [screen, selectedFolder, activeNoteId, notesReady, draftNote])
  useEffect(() => {
    if (!notesReady || (!globalSearchOpen && !['home', 'recent', 'favorites', 'folder', 'tags'].includes(screen))) return
    const controller = new AbortController()
    const { signal } = controller
    const candidates = notes.filter((note) => !note.trashed)
    const versions = new Map(candidates.map((note) => [note.id, `${note.updatedAt ?? 0}:${note.pageCount ?? ''}`]))
    const pending = candidates.filter((note) => indexedPdfVersions.current.get(note.id) !== versions.get(note.id))
    setPdfIndexing(pending.length > 0)
    void (async () => {
      for (const note of pending) {
        if (signal.aborted) return
        try {
          const content = await readNoteContent(note, signal)
          if (signal.aborted) return
          indexedPdfVersions.current.set(note.id, versions.get(note.id)!)
          setPdfContents((current) => new Map(current).set(note.id, content.pdf))
          setNoteContents((current) => new Map(current).set(note.id, content.body))
        } catch { if (signal.aborted) return }
      }
      if (!signal.aborted) setPdfIndexing(false)
    })()
    return () => controller.abort()
  }, [notes, notesReady, screen, globalSearchOpen])
  useEffect(() => {
    let cancelled = false
    void window.liftInk
      .loadNoteIndex()
      .then(({ value, recovered, orphanCount }) => {
        if (cancelled) return
        const closingFocus = readClosingFocus()
        if (value) setNotes(value.map((note) => {
          const pending = closingFocus[note.id]
          if (!pending) return note
          const days = { ...note.focusByDay }
          for (const [day, ms] of Object.entries(pending)) days[day] = Math.max(days[day] ?? 0, ms)
          return { ...note, focusByDay: days }
        }))
        if (orphanCount)
          setToast(`找回 ${orphanCount} 篇未列入目录的笔记，已放入未分类，请核对内容`)
        else if (recovered) setToast('笔记目录已从备份恢复，请核对最近的修改')
        setIndexLoadError(false)
        restoreWorkspace(value ?? [])
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
        () => {
          setIndexSaveError(false)
          const pending = readClosingFocus()
          for (const note of notes) {
            if (pending[note.id] && Object.entries(pending[note.id]).every(([day, ms]) => (note.focusByDay?.[day] ?? 0) >= ms)) delete pending[note.id]
          }
          if (Object.keys(pending).length) localStorage.setItem(closingFocusKey, JSON.stringify(pending))
          else localStorage.removeItem(closingFocusKey)
        },
        () => {
          setIndexSaveError(true)
          setToast('笔记目录保存失败')
        }
      )
  }, [notes, notesReady])
  const month = new Date(Math.floor(monthOffset / 12), monthOffset % 12, 1),
    days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(),
    firstWeekday = (month.getDay() + 6) % 7
  const selectedDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
  const selectCalendarDate = (nextMonth: number, day: number): void => {
    if (nextMonth !== monthOffset) {
      setMonthDirection(nextMonth < monthOffset ? 'previous' : 'next')
      setMonthOffset(nextMonth)
    }
    setSelectedDay(day)
  }
  useEffect(() => {
    if (!profile.reminders) return
    const notify = (): void => {
      const now = Date.now()
      const day = dayKey(new Date(now))
      const storageKey = 'liftink:reminders-shown'
      let shown: { date: string; ids: string[] } = { date: day, ids: [] }
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
        if (saved?.date === day && Array.isArray(saved.ids)) shown = saved
      } catch { /* reminders can proceed with an empty list */ }
      for (const item of agendaItems) {
        const id = `${item.id}:${item.time}`
        if (item.done || item.date !== day || !item.time || shown.ids.includes(id)) continue
        const due = new Date(`${item.date}T${item.time}:00`).getTime()
        if (!Number.isFinite(due) || due > now || due < now - 60_000) continue
        shown.ids.push(id)
        void window.liftInk.notifyAgenda(item.title, due).catch(() => undefined)
      }
      localStorage.setItem(storageKey, JSON.stringify(shown))
    }
    notify()
    const interval = window.setInterval(notify, 15_000)
    return () => window.clearInterval(interval)
  }, [agendaItems, profile.reminders])
  const dayAgenda = agendaItems
    .filter((item) => item.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time))
  const searchText = useMemo(() => new Map(notes.map((note) => [note.id, [...(noteContents.get(note.id) ?? []), ...(pdfContents.get(note.id) ?? [])]])), [notes, noteContents, pdfContents])
  const filtered = useMemo(() => {
      const term = normalizePdfText(query)
      return notes.filter(
        (n) =>
          !n.trashed &&
          (normalizePdfText(`${n.title} ${n.tags.join(' ')} ${n.folder} ${n.summary} 笔记`).includes(term) ||
            searchText.get(n.id)?.some((text) => normalizePdfText(text).includes(term))) &&
          (!selectedFolder ||
            n.folder === selectedFolder ||
            n.folder.startsWith(`${selectedFolder} / `)) &&
          (selectedNav !== '常用文件' || n.favorite)
      )
  }, [notes, query, selectedFolder, selectedNav, searchText])
  const searchResults = useMemo(() => {
    const items: SearchResult[] = [
      ...notes
        .filter((note) => !note.trashed)
        .map((note): SearchResult => ({
          id: note.id,
          title: note.title,
          kind: note.kind === 'pdf' || note.kind === 'image' ? note.kind : 'note' as const,
          folder: note.folder,
          summary: `${note.summary} · ${note.tags.join(' / ')}`
        }))
    ]
    const term = normalizePdfText(query)
    if (!term) return items.slice(0, 6)
    return items.flatMap((item) => {
      if (normalizePdfText(`${item.title} ${item.folder} ${item.summary}`).includes(term)) return [item]
      const pdf = pdfContents.get(item.id)?.find((text) => text.includes(term))
      const body = pdf ?? noteContents.get(item.id)?.map(normalizePdfText).find((text) => text.includes(term))
      if (!body) return []
      const position = body.indexOf(term)
      return [{ ...item, kind: pdf ? 'pdf' as const : item.kind, summary: `${pdf ? 'PDF 正文' : '笔记正文'} · ${body.slice(Math.max(0, position - 12), position + term.length + 18)}` }]
    }).slice(0, 6)
  }, [notes, query, pdfContents, noteContents])
  const libraryNotes = notes.filter((note) => !note.trashed)
  const showGettingStarted = notesReady && notes.length === 0 && !query.trim() && !selectedFolder
  const pagedNotes = libraryNotes.filter((note) => !note.workspace && (note.documentExpected || note.pageCount !== undefined))
  const today = new Date()
  const daysAgo = (days: number): Date => new Date(today.getFullYear(), today.getMonth(), today.getDate() - days)
  const focusSince = dayKey(daysAgo(chartPeriod - 1))
  const focusRanking = libraryNotes.map((note) => ({ note, ms: focusTotal(note, focusSince) }))
    .filter(({ ms }) => ms > 0).sort((a, b) => b.ms - a.ms)
  const focusMs = focusRanking.reduce((total, entry) => total + entry.ms, 0)
  const bucketCount = 7
  const chartBuckets = Array.from({ length: bucketCount }, (_, index) => {
    const from = daysAgo(chartPeriod - 1 - Math.floor(index * chartPeriod / bucketCount))
    const to = daysAgo(chartPeriod - Math.floor((index + 1) * chartPeriod / bucketCount))
    return { from: dayKey(from), to: dayKey(to), label: `${from.getMonth() + 1}/${from.getDate()}` }
  })
  const chartDates = chartBuckets.map(({ label }) => label)
  const chartValues = chartBuckets.map(({ from, to }) => libraryNotes.reduce((total, note) =>
    total + Object.entries(note.focusByDay ?? {}).reduce((sum, [day, ms]) => day >= from && day <= to ? sum + ms : sum, 0), 0))
  const chartMax = Math.max(60_000, ...chartValues)
  const chartPoints = chartValues.map((value, index) => ({
    x: 5 + (index * 510) / (chartValues.length - 1),
    y: 118 - value / chartMax * 90
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
  const keywords = useMemo(() => {
    const since = new Date()
    since.setHours(0, 0, 0, 0)
    since.setDate(since.getDate() - keywordPeriod + 1)
    return recentKeywords(notes, searchText, since.getTime(), blockedKeywords)
  }, [notes, searchText, keywordPeriod, blockedKeywords])
  const keywordNotes = (keyword: Keyword): Note[] =>
    notes.filter((note) => !note.trashed && keyword.noteIds.includes(note.id))
  const activeKeywordNotes = activeKeyword ? keywordNotes(activeKeyword) : []
  const activeNote = draftNote?.id === activeNoteId ? draftNote : notes.find((note) => note.id === activeNoteId && !note.trashed) ?? null
  const returnScreen = screen === 'recent' || screen === 'favorites' || screen === 'tags' || screen === 'folder' || screen === 'focus' || screen === 'agenda' ? screen : 'home'
  const openNote = (note: Note, pdfQuery = '', agendaId?: string): void => {
    setActiveAgendaId(agendaId)
    setInitialPdfQuery(pdfQuery)
    if (note.workspace === 'whiteboard') {
      void (async () => {
        try {
          const initial = emptyDocument(note.id)
          const elements = (note.draft?.boardItems ?? []).map((text, index) => ({
            kind: 'text' as const, id: crypto.randomUUID(), text, color: '#252638',
            fontSize: 24, width: 630, x: 60, y: 80 + index * 60
          }))
          initial.pages = [note.draft?.boardPage ?? { ...initial.pages[0], paper: 'blank', elements,
            size: { width: 960, height: Math.max(980, 140 + elements.length * 60) } }]
          const record: Note = { ...note, workspace: undefined, draft: undefined, documentExpected: true, pageCount: 1 }
          const existing = await window.liftInk.loadDocument(note.id)
          if (!existing.value) await window.liftInk.initializeNote(record, initial)
          setNotes((current) => current.map((entry) => entry.id === note.id ? record : entry))
          setEditorReturn(returnScreen)
          setActiveNoteId(note.id)
          setFocusNoteId(note.id)
          setScreen('editor')
        } catch (error) { setToast(`白板迁移失败，旧版内容已保留：${String(error)}`) }
      })()
      return
    }
    if (note.workspace) {
      setQuickKind(note.workspace)
      setQuickReturn(returnScreen)
      setActiveNoteId(note.id)
      setScreen('quick')
      return
    }
    setEditorReturn(returnScreen)
    setActiveNoteId(note.id)
    setFocusNoteId(note.id)
    setSearchOpen(false)
    setScreen('editor')
  }
  const createNoteFromFile = useCallback(async (input?: File | File[], fromShell = false, mode: 'blank' | 'markdown' | 'board' = 'blank'): Promise<void> => {
    if (!notesReady) {
      setToast('笔记目录仍在加载，暂时无法新建')
      return
    }
    if (creatingNote.current || (readingShellPdf.current && !fromShell)) return
    setActiveAgendaId(undefined)
    const makeNote = (file?: File): Note => {
      const now = Date.now()
      const id = crypto.randomUUID()
      const kind = file ? isPdfFile(file) ? 'pdf' : isMarkdownFile(file) ? 'markdown' : 'image' : mode === 'blank' && preferences.noteType === 'board' ? 'board' : mode
      const summary = { pdf: 'PDF 批注笔记', image: '图片笔记', markdown: 'Markdown 笔记', blank: '空白笔记', board: '白板' }[kind]
      return {
        id, title: file?.name.replace(/\.[^.]+$/, '').trim() || (kind === 'board' ? '未命名白板' : '未命名笔记'), originalTitle: `new-${id}`,
        date: '', createdAt: now, updatedAt: now, tags: [], kind,
        folder: preferences.newFolder === 'current' && screen === 'folder' && selectedFolder ? selectedFolder : '未分类', summary,
        favorite: false, documentExpected: true
      }
    }
    if (!input) {
      const note = makeNote()
      draftRef.current = note
      setDraftNote(note)
      setEditorReturn(returnScreen)
      setActiveNoteId(note.id)
      setInitialPdfQuery('')
      setFocusNoteId(note.id)
      setModal(null)
      setSearchOpen(false)
      setScreen('editor')
      return
    }
    const files = Array.isArray(input) ? input : [input]
    if (!files.length) return
    if (files.length > 10) { setToast('单次最多导入 10 个文件'); return }
    creatingNote.current = true
    setNewNoteBusy(true)
    const imported: Note[] = []
    const failed: string[] = []
    try {
      for (const file of files) {
        const note = makeNote(file)
        try {
          let initial: NoteDocument
          if (isPdfFile(file)) {
            const { sourceId, pages } = await preparePdf(file, MAX_NOTE_PAGES, setPdfImportStatus)
            initial = { version: 1, noteId: note.id, revision: 0, pages, sourcePdfId: sourceId, sourcePdfIds: [sourceId] }
          } else if (isMarkdownFile(file)) {
            setPdfImportStatus(`正在导入 ${file.name}…`)
            initial = await importMarkdown(file, note.id)
          } else {
            setPdfImportStatus(`正在导入 ${file.name}…`)
            const image = await storeImageFile(file)
            const { width, height } = await imageDimensions(image.dataUrl)
            const scale = Math.min(1, 650 / width, 880 / height)
            const w = width * scale, h = height * scale
            initial = { version: 1, noteId: note.id, revision: 0, pages: [{
              id: crypto.randomUUID(), paper: 'blank', elements: [{
                kind: 'image', id: crypto.randomUUID(), assetId: image.assetId,
                width: w, height: h, x: (750 - w) / 2, y: (980 - h) / 2
              }]
            }] }
          }
          note.pageCount = initial.pages.length
          await window.liftInk.initializeNote(note, initial)
          imported.push(note)
          setNotes((current) => [note, ...current])
        } catch (error) { failed.push(`${file.name}：${String(error)}`) }
      }
      if (imported.length) {
        setSelectedNav('首页')
        setSelectedFolder(null)
        setQuery('')
        setModal(null)
        setSearchOpen(false)
        if (files.length === 1) {
          setEditorReturn(returnScreen === 'folder' ? 'home' : returnScreen)
          setActiveNoteId(imported[0].id)
          setInitialPdfQuery('')
          setFocusNoteId(imported[0].id)
          setScreen('editor')
        } else setScreen('recent')
      }
      setToast(failed.length ? `已导入 ${imported.length} 个，${failed.length} 个失败。${failed[0]}` : `已导入 ${imported.length} 个文件，可直接批注`)
    } finally {
      creatingNote.current = false
      setNewNoteBusy(false)
      setPdfImportStatus('')
    }
  }, [returnScreen, notesReady, preferences.newFolder, preferences.noteType, selectedFolder, screen])
  const createNote = useCallback((): void => { void createNoteFromFile() }, [createNoteFromFile])
  const openHomeQuick = (kind: QuickKind): void => {
    setActiveNoteId(null)
    setQuickReturn('home')
    setQuickKind(kind)
    setScreen('quick')
  }
  const createMarkdownNote = (): void => { void createNoteFromFile(undefined, false, 'markdown') }
  const receiveOpenedPdfs = useEffectEvent(async (): Promise<void> => {
    if (!notesReady || creatingNote.current || readingShellPdf.current) return
    readingShellPdf.current = true
    try {
      for (;;) {
        shellPdfNotified.current = false
        const request = await window.liftInk.takeOpenedPdf()
        if (!request) {
          if (shellPdfNotified.current) continue
          break
        }
        if ('error' in request) setToast(`PDF 导入失败：${request.error}`)
        else {
          const file = new File([new Uint8Array(request.bytes)], request.name, { type: 'application/pdf' })
          await createNoteFromFile(file, true)
        }
      }
    } catch {
      setToast('无法接收 Windows 打开的 PDF')
    } finally {
      readingShellPdf.current = false
    }
  })
  useEffect(() => {
    if (!notesReady || newNoteBusy) return
    const unsubscribe = window.liftInk.onPdfOpenAvailable(() => {
      shellPdfNotified.current = true
      void receiveOpenedPdfs()
    })
    const initialCheck = window.setTimeout(() => { void receiveOpenedPdfs() }, 0)
    return () => {
      window.clearTimeout(initialCheck)
      unsubscribe()
    }
  }, [notesReady, newNoteBusy])
  const saveQuickNote = async (
    title: string,
    kind: 'voice' | 'map' | 'board',
    summary: string,
    draft: QuickDraft,
    targetId = activeNoteId,
    stay = false
  ): Promise<void> => {
    if (!notesReady) throw new Error('笔记库尚未就绪')
    const workspace = kind === 'map' ? 'mindmap' : kind === 'board' ? 'whiteboard' : 'voice'
    const existing = notes.find((note) => note.id === targetId && !note.trashed)
    const id = existing?.id ?? crypto.randomUUID()
    const now = Date.now()
    const record: Note = {
      id, originalTitle: `new-${id}`, date: '', createdAt: now, tags: [], kind,
      workspace, folder: '未分类', favorite: false, ...existing,
      title, summary, draft, updatedAt: now
    }
    await window.liftInk.saveNoteIndex(existing ? notes.map((note) => note.id === id ? record : note) : [record, ...notes])
    setNotes((current) => existing ? current.map((note) => note.id === id ? record : note) : [record, ...current])
    if (!stay) { setSelectedFolder(null); setActiveNoteId(null); setScreen('recent') }
    setToast('笔记已保存')
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
    if (!trashUndoId) return
    const id = window.setTimeout(() => setTrashUndoId(null), 8000)
    return () => window.clearTimeout(id)
  }, [trashUndoId])
  useEffect(() => {
    if (!notesReady) return
    const sweep = (): void => {
      void window.liftInk.sweepTrash().then((expired) => {
        if (expired.length) setNotes((current) => current.filter((note) => !expired.includes(note.id)))
      }).catch(() => setToast('回收站清理失败，下次打开时会重试'))
    }
    const interval = window.setInterval(sweep, 60_000)
    if (screen === 'trash') sweep()
    return () => window.clearInterval(interval)
  }, [notesReady, screen])
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (vaultBusy) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.isComposing) {
        e.preventDefault()
        if (screen === 'home') {
          document.querySelector<HTMLInputElement>('.search-box input')?.focus()
          setSearchOpen(true)
        } else {
          if (!globalSearchOpen) searchReturnFocus.current = (document.activeElement as HTMLElement | null)
          setGlobalSearchOpen(true)
          setSearchOpen(true)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        createNote()
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        openFileInput.current?.click()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNote, globalSearchOpen, screen, vaultBusy])
  useEffect(() => {
    const closeSearch = (event: PointerEvent): void => {
      if (!(event.target as HTMLElement).closest('.search-wrap')) setSearchOpen(false)
    }
    document.addEventListener('pointerdown', closeSearch)
    return () => document.removeEventListener('pointerdown', closeSearch)
  }, [])
  const openSearchResult = async (result: SearchResult): Promise<void> => {
    if (globalSearchOpen) {
      try {
        await flushEditorSaves()
        await flushVaultSettings()
      } catch (error) {
        setToast(`保存失败，未切换笔记：${String(error)}`)
        return
      }
    }
    setGlobalSearchOpen(false)
    setSearchOpen(false)
    const note = notes.find((entry) => entry.id === result.id)
    if (note) openNote(note, pdfContents.get(note.id)?.some((text) => text.includes(normalizePdfText(query))) ? query : '')
    else setToast('这篇笔记已不存在')
  }
  const updateNote = (id: string, patch: Partial<Note>): void => {
    const changed = 'trashed' in patch ? patch : { ...patch, updatedAt: Date.now() }
    if (draftRef.current?.id === id) {
      draftRef.current = { ...draftRef.current, ...changed }
      setDraftNote(draftRef.current)
    } else setNotes((current) => current.map((note) => (note.id === id ? { ...note, ...changed } : note)))
  }
  const persistDraft = async (snapshot: Note, document: NoteDocument): Promise<void> => {
    const draft = draftRef.current?.id === snapshot.id ? draftRef.current : snapshot
    const now = Date.now()
    const created = { ...draft, title: draft.title.trim() || '未命名笔记', createdAt: now, updatedAt: now, pageCount: document.pages.length }
    await window.liftInk.initializeNote(created, document)
    const latest = draftRef.current?.id === draft.id ? draftRef.current : draft
    // Queue the index write before a window-close save is acknowledged.
    flushSync(() => {
      setNotes((current) => [{ ...created, title: latest.title.trim() || '未命名笔记', tags: latest.tags, folder: latest.folder, focusByDay: latest.focusByDay }, ...current])
      if (draftRef.current?.id === draft.id) {
        draftRef.current = null
        setDraftNote(null)
      }
    })
  }
  const updateDocumentStats = (id: string, timestamp: number, pageCount: number): void => {
    setLastSaved(timestamp)
    indexedPdfVersions.current.delete(id)
    setNotes((current) => {
      const note = current.find((entry) => entry.id === id)
      if (!note || (note.pageCount === pageCount && Math.floor((note.updatedAt ?? 0) / 60000) >= Math.floor(timestamp / 60000))) return current
      return current.map((entry) => entry.id === id ? { ...entry, updatedAt: Math.max(timestamp, entry.updatedAt ?? 0), pageCount } : entry)
    })
  }
  const addFocusTime = (id: string, day: string, ms: number, closing?: boolean): void => {
    if (closing) {
      if (draftRef.current?.id === id) return
      const pending = readClosingFocus()
      pending[id] = { ...pending[id], [day]: Math.max(ms, pending[id]?.[day] ?? 0) }
      localStorage.setItem(closingFocusKey, JSON.stringify(pending))
      return
    }
    const add = (note: Note): Note => ({ ...note, focusByDay: { ...note.focusByDay, [day]: (note.focusByDay?.[day] ?? 0) + ms } })
    if (draftRef.current?.id === id) {
      draftRef.current = add(draftRef.current)
      setDraftNote(draftRef.current)
    } else setNotes((current) => current.map((note) => note.id === id ? add(note) : note))
  }
  const restoreNote = (id: string): void => {
    const note = notes.find((entry) => entry.id === id)
    if (!note?.trashed || (note.trashedAt !== undefined && Date.now() - note.trashedAt >= TRASH_RETENTION_MS)) return
    updateNote(id, { trashed: false, trashedAt: undefined })
    setTrashUndoId((previous) => previous === id ? null : previous)
    setToast('已还原到原文件夹')
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
        ? { id: item.id, time: item.time, title: item.title, noteId: item.noteId ?? '', goalId: item.goalId ?? '', minutes: String(item.minutes ?? '') }
        : { id: '', time: '', title: '', noteId: '', goalId: '', minutes: '' }
    )
    setModal(item ? '修改日程' : '新增日程')
  }
  const openGoalForm = (goal?: Goal): void => {
    setGoalDraft(goal ? { id: goal.id, title: goal.title, noteId: goal.noteId ?? '' } : { id: '', title: '', noteId: '' })
    setModal(goal ? '编辑目标' : '新增目标')
  }
  const confirmAgendaDelete = (id: string): void => {
    const item = agendaItems.find((entry) => entry.id === id)
    if (item) { setPendingAgendaDelete(item); setModal('删除日程') }
  }
  const openLinkedNote = (noteId: string, agendaId?: string): void => {
    const note = notes.find((entry) => entry.id === noteId && !entry.trashed)
    if (note) openNote(note, '', agendaId)
    else setToast('关联笔记已不存在或在回收站')
  }
  const completeAgenda = (id: string, done: boolean): void => {
    const item = agendaItems.find((entry) => entry.id === id)
    setAgendaItems((items) => items.map((entry) => entry.id === id ? { ...entry, done } : entry))
    if (done && item?.goalId) setGoals((current) => current.map((goal) => goal.id === item.goalId ? { ...goal, done: true } : goal))
  }
  const goalRows = (editable: boolean, rows = goals): React.JSX.Element => <>
    {rows.length ? rows.map((goal) => (
      <div key={goal.id} className="goal-row">
        <button className="goal" aria-pressed={goal.done} onClick={() => setGoals((current) => current.map((entry) => entry.id === goal.id ? { ...entry, done: !entry.done } : entry))}>
          <span className={goal.done ? 'checked' : ''}>{goal.done && <Check size={17} />}</span><b title={goal.title}>{goal.title}</b>
        </button>
        {editable && <div className="goal-actions">
          {goal.noteId && <button onClick={() => openLinkedNote(goal.noteId!)}>打开笔记</button>}
          <button aria-label={`编辑目标 ${goal.title}`} onClick={() => openGoalForm(goal)}>编辑</button>
          <button aria-label={`删除目标 ${goal.title}`} onClick={() => { setGoalDraft({ id: goal.id, title: goal.title, noteId: goal.noteId ?? '' }); setModal('删除目标') }}>删除</button>
        </div>}
      </div>
    )) : <p className="empty-day">暂无目标</p>}
  </>
  const focusPeriodButtons = <div className="stat-periods" aria-label="书写趋势时间范围">
    {([7, 30, 90] as const).map((period) => <button key={period} className={chartPeriod === period ? 'selected' : ''} aria-pressed={chartPeriod === period} onClick={() => { setChartPeriod(period); setHoveredPoint(null) }}>{period} 天</button>)}
  </div>
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
  const openFolder = (path: string): void => {
    setSelectedFolder(path)
    setSelectedNav('文件目录')
    setActiveNoteId(null)
    setCardMenu(null)
    setSearchOpen(false)
    setScreen('folder')
  }
  const changeFolder = (source: string, parent: string, inputName: string, remove = false): string | undefined => {
    if (!notesReady || indexLoadError) return '笔记目录尚未成功载入'
    if (source === '未分类' || parent === '未分类') return '未分类为系统分区'
    const name = inputName.trim()
    if (!remove && !name) return '请输入文件夹名称'
    if (!remove && (/[\\/]/.test(name) || name.length > 80)) return '名称不能包含斜杠，且最多 80 个字符'
    if ((remove || source) && !folders.includes(source)) return '文件夹已不存在'
    if (source && (parent === source || parent.startsWith(`${source} / `))) return '无法移动至自身或子分区'
    if (parent && !folders.includes(parent)) return '上级分区已不存在'
    const target = remove ? parentFolder(source) || '未分类' : [parent, name].filter(Boolean).join(' / ')
    if (!remove && target !== source && folders.includes(target)) return '此处已有同名文件夹'
    if (target === source) return
    const within = (path: string): boolean => !!source && (path === source || path.startsWith(`${source} / `))
    const move = (path: string): string => within(path) ? remove ? target : target + path.slice(source.length) : path
    setFolderCatalog([...new Set([...folders.filter((path) => !remove || !within(path)).map(move), target])])
    setNotes((current) => current.map((note) => within(note.folder) ? { ...note, folder: move(note.folder) } : note))
    if (draftRef.current && within(draftRef.current.folder)) {
      draftRef.current = { ...draftRef.current, folder: move(draftRef.current.folder) }
      setDraftNote(draftRef.current)
    }
    if (selectedFolder && within(selectedFolder)) setSelectedFolder(move(selectedFolder))
    setExpandedFolders((current) => new Set([...current].filter((path) => !remove || !within(path)).map(move)))
    return undefined
  }
  const beginFolderAction = (action: FolderAction): void => {
    setFolderName(action.kind === 'rename' ? folderPath(action.path).at(-1) ?? '' : '')
    setFolderError('')
    setFolderMenu(null)
    setFolderAction(action)
  }
  const submitFolderAction = (action: FolderAction): void => {
    const source = action.kind === 'create' ? '' : action.path
    const parent = action.kind === 'create' ? action.parent : parentFolder(source)
    const remove = action.kind === 'delete'
    const name = folderName.trim()
    const error = changeFolder(source, parent, name, remove)
    if (error) { setFolderError(error); return }
    if (action.kind === 'create') {
      const segments = folderPath(parent)
      setExpandedFolders((current) => new Set([...current, ...segments.map((_, i) => segments.slice(0, i + 1).join(' / '))]))
      setFolderOpen(true)
      openFolder([parent, name].filter(Boolean).join(' / '))
    }
    setFolderAction(null)
    setToast(remove ? '已删除文件夹，笔记已保留' : action.kind === 'rename' ? '文件夹已重命名' : '文件夹已创建')
  }

  const backupLibrary = async (single?: Note, toDirectory = false): Promise<void> => {
    if (!notesReady || libraryBusy || backupInProgress.current) return
    backupInProgress.current = true
    setLibraryBusy(true)
    try {
      await flushEditorSaves()
      const entries: PortableEntry[] = []
      for (const note of single ? [single] : notes) {
        const document = note.workspace ? null : (await window.liftInk.loadDocument(note.id)).value
        if (note.documentExpected && !document) throw new Error(`缺少笔记文档：${note.title}`)
        entries.push({ note, document })
      }
      const settings = single ? undefined : { folders, tagCatalog, agendaItems, goals, profile, blockedKeywords }
      const data = await makePortable(entries, settings)
      const path = toDirectory ? await window.liftInk.writeLibraryBackup(base64Of(data)) : await window.liftInk.saveExport('liftink', single?.title || 'LiftInk 资料库备份', base64Of(data))
      if (path) {
        if (!single) setLastBackup(Date.now())
        setToast('备份已导出')
      }
    } catch (error) { setToast(`备份失败：${String(error)}`) }
    finally { backupInProgress.current = false; setLibraryBusy(false) }
  }
  const runVaultAction = async (operation: VaultOperation, automatic = false): Promise<void> => {
    if (libraryBusy || backupInProgress.current || (operation === 'migrate' || operation === 'snapshot') && !notesReady) return
    backupInProgress.current = true
    setLibraryBusy(true)
    if (!automatic) setVaultBusy(true)
    let switching = false
    try {
      await flushEditorSaves()
      await flushVaultSettings()
      const path = await window.liftInk.vaultOperation(operation, automatic)
      if (!path) return
      if (operation === 'snapshot') {
        setLastBackup(Date.now())
        setToast('资料库快照已保存并校验')
      } else switching = true
    } catch (error) { setToast(`资料库操作失败：${String(error)}`) }
    finally {
      if (!switching) {
        backupInProgress.current = false
        setLibraryBusy(false)
        setVaultBusy(false)
      }
    }
  }
  const runScheduledBackup = useEffectEvent(async () => {
    const now = Date.now()
    if (!preferences.backupInterval || libraryBusy || backupInProgress.current ||
        (screen !== 'home' && screen !== 'settings') ||
        now - Math.max(lastBackup, lastBackupAttempt.current) < preferences.backupInterval * 86_400_000) return
    if ((await window.liftInk.storageInfo()).backupDirectory) {
      lastBackupAttempt.current = now
      await runVaultAction('snapshot', true)
    }
  })
  useEffect(() => {
    if (!notesReady || !preferences.backupInterval) return
    const tick = (): void => { void runScheduledBackup().catch(() => setToast('无法检查自动备份目录')) }
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [notesReady, preferences.backupInterval])

  const restoreLibrary = async (file: File): Promise<void> => {
    if (!notesReady || libraryBusy) return
    setLibraryBusy(true)
    try {
      const { entries, settings, zip } = await readPortable(file)
      const configuration = readLibrarySettings(settings)
      await restoreReferencedAssets(zip, entries)
      const ids = new Map(entries.map((entry) => [entry.note?.id ?? entry.document!.noteId, crypto.randomUUID()]))
      const restored: Note[] = []
      for (const { note, document } of entries) {
        const id = ids.get(note?.id ?? document!.noteId)!
        const record: Note = {
          title: file.name.replace(/\.liftink$/i, ''), originalTitle: `new-${id}`, date: '', kind: document?.richText ? 'markdown' : 'blank',
          tags: [], folder: '未分类', favorite: false, summary: '从备份恢复', createdAt: Date.now(),
          ...note, id, documentExpected: !!document
        }
        if (document) {
          await window.liftInk.initializeNote(record, { ...document, noteId: id, excerpts: document.excerpts?.map((excerpt) => ({
            ...excerpt, sourceNoteId: ids.get(excerpt.sourceNoteId) ?? excerpt.sourceNoteId
          })) })
        }
        restored.push(record)
      }
      await window.liftInk.saveNoteIndex([...restored, ...notes])
      setNotes((current) => [...restored, ...current])
      if (configuration) {
        if (configuration.blockedKeywords) setBlockedKeywords((current) => [...new Set([...current, ...configuration.blockedKeywords!])])
        setFolderCatalog((current) => [...new Set([...current, ...configuration.folders])])
        setTagCatalog((current) => [...new Set([...current, ...configuration.tagCatalog])])
        const goalIds = new Map(configuration.goals.map((goal) => [goal.id, crypto.randomUUID()]))
        setAgendaItems((current) => [...current, ...configuration.agendaItems.map((item) => ({
          ...item, id: crypto.randomUUID(), noteId: ids.get(item.noteId ?? ''), goalId: goalIds.get(item.goalId ?? '')
        }))])
        setGoals((current) => [...current, ...configuration.goals.map((goal) => ({
          ...goal, id: goalIds.get(goal.id)!, noteId: ids.get(goal.noteId ?? '')
        }))])
        if (!profile.name) setProfile(configuration.profile)
      }
      setToast(`已恢复 ${restored.length} 篇笔记`)
    } catch (error) { setToast(`导入失败：${String(error)}`) }
    finally { setLibraryBusy(false) }
  }

  const cleanLibrary = async (): Promise<void> => {
    if (!notesReady || libraryBusy) return
    setLibraryBusy(true)
    try {
      await flushEditorSaves()
      const ids = new Set<string>()
      for (const [key, value] of getVaultSettingEntries()) {
        if (!key.startsWith('liftink:quick-draft:')) continue
        const saved = JSON.parse(value) as { draft?: QuickDraft } | null
        if (!saved?.draft) continue
        for (const id of referencedAssets(null, { draft: saved.draft } as NoteRecord)) ids.add(id)
      }
      const { count } = await window.liftInk.cleanAssets([...ids])
      setToast(count ? `已清理 ${count} 个无引用附件` : '没有超过保留期的无引用附件')
    } catch (error) { setToast(`清理失败：${String(error)}`) }
    finally { setLibraryBusy(false) }
  }

  const renderNoteMenu = (note: Note): React.JSX.Element => (
    <div className="note-menu glass">
      <button onClick={() => openNoteOperation(note, '重命名笔记')}>重命名</button>
      <button onClick={() => { updateNote(note.id, { favorite: !note.favorite }); setCardMenu(null) }}>
        {note.favorite ? '取消收藏' : '收藏'}
      </button>
      <button onClick={() => openNoteOperation(note, '移动笔记')}>移动到</button>
      <button disabled={libraryBusy} onClick={() => { setCardMenu(null); void backupLibrary(note) }}>导出 LiftInk 备份</button>
      <button onClick={() => {
        updateNote(note.id, { trashed: true, trashedAt: Date.now() })
        setCardMenu(null)
        setToast('')
        setTrashUndoId(note.id)
      }}>
        <Trash2 size={14} /> 移入回收站
      </button>
    </div>
  )
  const renderFolder = (node: FolderNode, parent = '', depth = 0): React.JSX.Element => {
    const path = parent ? `${parent} / ${node.name}` : node.name
    const expanded = expandedFolders.has(path)
    const hasChildren = !!node.children?.length
    const menuOpen = folderMenu === path
    return (
      <div className="folder-branch" key={path}
        onBlur={(event) => {
          if (menuOpen && !event.currentTarget.contains(event.relatedTarget)) setFolderMenu(null)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !menuOpen) return
          event.stopPropagation()
          event.currentTarget.querySelector<HTMLButtonElement>('.folder-row-action')?.focus()
          setFolderMenu(null)
        }}>
        <div className="folder-row" style={{ paddingLeft: Math.min(depth, 7) * 13 }}
          onContextMenu={path === '未分类' || !notesReady || indexLoadError ? undefined : (event) => {
            event.preventDefault()
            event.currentTarget.querySelector<HTMLButtonElement>('.folder-row-action')?.focus()
            setFolderMenu(path)
          }}>
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
            aria-current={screen === 'folder' && selectedFolder === path ? 'page' : undefined}
            title={node.name}
            onClick={() => { setFolderMenu(null); openFolder(path) }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const id = event.dataTransfer.getData('application/x-liftink-note')
              if (notes.some((note) => note.id === id)) {
                updateNote(id, { folder: path })
                setToast(`已移至「${path}」`)
              }
            }}
          >
            {expanded || selectedFolder === path ? <FolderOpen size={19} /> : <Folder size={19} />}
            <span>{node.name}</span>
          </button>
          {path !== '未分类' && <button type="button" className="folder-row-action"
            aria-label={`管理文件夹 ${path}`} title="管理文件夹" aria-expanded={menuOpen}
            disabled={!notesReady || indexLoadError}
            onClick={() => setFolderMenu(menuOpen ? null : path)}><MoreHorizontal size={17} /></button>}
        </div>
        {menuOpen && <div className="folder-action-menu" role="group" aria-label={`${node.name}的操作`}
          onClickCapture={(event) => {
            folderActionTrigger.current = event.currentTarget.closest('.folder-branch')?.querySelector<HTMLButtonElement>('.folder-row-action') ?? null
          }}>
          <button type="button" onClick={() => beginFolderAction({ kind: 'create', parent: path })}><Plus size={16} />新建子文件夹</button>
          <button type="button" onClick={() => beginFolderAction({ kind: 'rename', path })}><PenLine size={16} />重命名</button>
          <button type="button" className="folder-delete" onClick={() => beginFolderAction({ kind: 'delete', path })}><Trash2 size={16} />删除文件夹</button>
        </div>}
        {hasChildren && expanded && (
          <div className="folder-children">
            {node.children!.map((child) => renderFolder(child, path, depth + 1))}
          </div>
        )}
      </div>
    )
  }
  const searchBox = (
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
            if (e.nativeEvent.isComposing) return
            if (e.key === 'ArrowDown' && searchResults.length) {
              e.preventDefault()
              setSearchIndex((index) => Math.min(index + 1, searchResults.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSearchIndex((index) => Math.max(index - 1, 0))
            }
            if (e.key === 'Enter' && searchResults[searchIndex]) {
              e.preventDefault()
              void openSearchResult(searchResults[searchIndex])
            }
            if (e.key === 'Escape' && !globalSearchOpen) {
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
                onClick={() => void openSearchResult(result)}
              >
                <NoteFileIcon kind={result.kind} size={20} />
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
            <div className="search-empty">{pdfIndexing ? '正在索引 PDF 正文…' : '没有找到匹配的笔记或 PDF'}</div>
          )}
          <div className="search-hint">↑ ↓ 选择 · Enter 打开 · Esc 关闭</div>
        </div>
      )}
    </div>
  )

  return (
    <div
      className={`app-shell view-${screen}${['trash', 'folder', 'favorites', 'focus'].includes(screen) ? ' view-recent' : ''}`}
      style={{ '--schedule-width': `${scheduleWidth}px` } as React.CSSProperties}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        if (screen === 'home') {
          const available = notesReady && !creatingNote.current && !readingShellPdf.current && !modal
          event.dataTransfer.dropEffect = available ? 'copy' : 'none'
          setHomeDropActive(available)
        }
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        setHomeDropActive(false)
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return
        event.preventDefault()
        setHomeDropActive(false)
        if (screen !== 'home' || modal) return
        const files = [...event.dataTransfer.files]
        if (files.some((file) => !isPdfFile(file) && !isMarkdownFile(file) && !imageMime(file))) {
          setToast('请拖入 PDF、Markdown、PNG、JPG 或 WebP 文件')
          return
        }
        void createNoteFromFile(files)
      }}
    >
      <svg className="mountain-backdrop" aria-hidden="true" viewBox="0 0 1500 330" preserveAspectRatio="xMidYMin slice">
        <defs>
          <linearGradient id="liftink-sky" x2="0" y2="1">
            <stop stopColor="var(--theme-sky)" /><stop offset=".65" stopColor="var(--theme-surface)" />
            <stop offset="1" stopColor="var(--theme-base)" />
          </linearGradient>
          <linearGradient id="liftink-hill" x2="0" y2="1">
            <stop stopColor="var(--theme-ridge)" /><stop offset="1" stopColor="var(--theme-canvas)" />
          </linearGradient>
        </defs>
        <rect width="1500" height="330" fill="url(#liftink-sky)" />
        <circle cx="1100" cy="65" r="34" fill="var(--theme-sun)" opacity=".8" />
        <path d="M0 180 170 145 280 163 420 106 550 168 700 139 850 171 1010 98 1100 120 1230 39 1300 116 1400 92 1500 143V330H0Z" fill="var(--theme-ridge)" opacity=".47" />
        <path d="M0 214 130 178 270 210 450 154 580 196 725 140 860 207 1040 142 1125 184 1250 53 1320 154 1420 126 1500 165V330H0Z" fill="url(#liftink-hill)" opacity=".69" />
        <path d="m1160 135 90-82 70 101-34-17-39-56-40 54Z" fill="var(--theme-surface)" opacity=".86" />
        <path d="M0 250 140 231 255 245 400 210 560 249 720 218 870 251 1040 212 1200 240 1360 195 1500 229V330H0Z" fill="var(--theme-canvas)" opacity=".58" />
      </svg>
      <aside className="navigation">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <div className="brand" aria-label="LiftInk">
          <img src={liftInkMark} width="35" height="35" alt="" />
          <strong>LiftInk</strong>
        </div>
        <nav className="nav-links" aria-label="主导航">
          {[
            [Home, '首页'],
            [Star, '常用文件'],
            [Tag, '标签']
          ].map(([Icon, label]) => (
            <button
              key={label as string}
              className={`nav-item ${screen !== 'editor' && selectedNav === label ? 'active' : ''}`}
              onClick={() => {
                setSelectedNav(label as string)
                setSelectedFolder(null)
                setScreen(label === '标签' ? 'tags' : label === '常用文件' ? 'favorites' : 'home')
                setActiveNoteId(null)
              }}
            >
              <Icon size={22} />
              {label as string}
            </button>
          ))}
          <div className="folder-heading-row">
            <button className="nav-item folder-heading" aria-expanded={folderOpen} onClick={() => {
              setFolderMenu(null)
              setFolderOpen(!folderOpen)
            }}>
              <ChevronDown size={16} className={folderOpen ? '' : 'closed'} />
              <Folder size={22} />
              文件目录
            </button>
            <button ref={addFolderButton} type="button" className="folder-row-action" aria-label="新建文件夹"
              title="新建文件夹" disabled={!notesReady || indexLoadError}
              onClick={(event) => {
                folderActionTrigger.current = event.currentTarget
                beginFolderAction({ kind: 'create', parent: '' })
              }}><Plus size={19} /></button>
          </div>
          {folderOpen && (
            <div className="folder-list">{folderTree.map((node) => renderFolder(node))}</div>
          )}
        </nav>
        <div className="nav-footer">
          <button
            className={`nav-item ${screen === 'trash' ? 'active' : ''}`}
            aria-current={screen === 'trash' ? 'page' : undefined}
            onClick={() => {
              setSelectedNav('回收站')
              setSelectedFolder(null)
              setActiveNoteId(null)
              setScreen('trash')
            }}
          >
            <Trash2 size={22} />
            回收站
          </button>
          <button
          className="nav-item settings"
          onClick={() => {
            setSettingsSection(undefined)
            setSelectedNav('设置')
            setSelectedFolder(null)
            setActiveNoteId(null)
            setScreen('settings')
          }}
        >
          <Settings size={22} />
          设置
          </button>
        </div>
      </aside>
      <header className="brand-header">
        <em>Lift your head. Ink your mind.</em>
        <span className="slogan-cn">抬头落墨，平视成章。</span>
        <div className="header-spacer" />
        <button aria-label="通知" className="icon-button" onClick={() => setModal('日程通知')}>
          <Bell size={23} />
          {profile.reminders && agendaItems.some((item) => !item.done && item.date === dayKey(new Date())) && <i className="notification-dot" />}
        </button>
        <button aria-label="本机资料" className="avatar" title={profile.name || '本机资料'} onClick={() => { setSettingsSection('general'); setSelectedNav('设置'); setScreen('settings') }}>
          <UserRound size={22} />
        </button>
      </header>
      <input ref={openFileInput} type="file" accept=".pdf,.md,.markdown,image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => {
        const selected = [...(event.target.files ?? [])]
        event.target.value = ''
        if (selected.length) void createNoteFromFile(selected)
      }} />
      <input ref={libraryInput} type="file" accept=".liftink" hidden onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void restoreLibrary(file)
      }} />
      <main key={screen === 'folder' ? `folder:${selectedFolder}` : screen} className="workspace page-enter">
        {screen === 'home' ? (
          <div className="content-area">
            {searchBox}
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
                [FileImage, '导入 PDF/图片'],
                [Network, '新建思维导图'],
                [FileText, '新建 Markdown']
              ].map(([Icon, label]) => (
                <button
                  className={`quick-button glass${label === '新建 Markdown' ? ' quick-button-markdown' : ''}`}
                  key={label as string}
                  onClick={() => {
                    if (label === '新建 Markdown') { createMarkdownNote(); return }
                    openHomeQuick(label === '导入 PDF/图片' ? 'import' : 'mindmap')
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
                    <button onClick={() => {
                      setMoreOpen(false)
                      void createNoteFromFile(undefined, false, 'board')
                    }}>新建白板</button>
                  </div>
                )}
              </div>
            </div>
            <section className="recent glass">
              <div className="panel-title">
                <h2>
                  最近笔记 <ChevronRight size={20} />
                </h2>
                <div className="recent-heading-actions">
                <button
                  onClick={() => {
                    setSelectedFolder(null)
                    setQuery('')
                    setSelectedNav('首页')
                    setScreen('recent')
                  }}
                >
                  查看全部 <ChevronRight size={18} />
                </button>
                </div>
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
                        <NotePageThumbnail note={note} />
                        <strong className="note-card-title"><NoteFileIcon kind={note.kind} size={17} />{note.title}</strong>
                        <span title={noteDateDetail(note)}>{noteDate(note)}</span>
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
                      {cardMenu === note.id && renderNoteMenu(note)}
                    </div>
                  ))
                ) : showGettingStarted ? (
                  <div className="home-getting-started">
                    <div>
                      <h3>开始使用 LiftInk</h3>
                      <p>写下第一篇笔记，或拖入 PDF、图片开始批注。编辑会自动保存到本机。</p>
                    </div>
                    <div className="home-getting-started-actions">
                      <button className="home-getting-started-primary" onClick={createNote}>
                        <PenLine size={17} /> 写第一篇笔记
                      </button>
                      <button onClick={() => openHomeQuick('import')}>
                        <FileImage size={17} /> 选择 PDF 或图片
                      </button>
                      <button onClick={() => {
                        setSettingsSection('files')
                        setSelectedNav('设置')
                        setScreen('settings')
                      }}>
                        <FolderOpen size={17} /> 已有资料库或备份
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="empty-notes">
                    {indexLoadError ? '无法读取笔记目录' : !notesReady ? '正在读取笔记目录…' : query.trim() || selectedFolder ? '未找到匹配的笔记' : '暂无最近笔记'}
                  </div>
                )}
              </div>
            </section>
            <div className="bottom-grid">
              <section className="stats glass">
                <div className="panel-title stats-heading">
                  <h2>书写概览</h2>
                  {focusPeriodButtons}
                </div>
                <div className="stat-values">
                  <div>
                    <FileText size={29} />
                    <strong>
                    {libraryNotes.length} <small>篇</small>
                    </strong>
                    <span>笔记总数</span>
                  </div>
                    <button className="stat-focus-link" aria-label="查看专注时间统计" onClick={() => setScreen('focus')}>
                      <Flame size={30} />
                      <strong>{formatDuration(focusMs)}</strong>
                      <span>专注时间 <ChevronRight size={13} /></span>
                    </button>
                  <div>
                    <PenLine size={32} />
                    <strong>
                    {pagedNotes.reduce((total, note) => total + (note.pageCount ?? 0), 0)} <small>页</small>
                    </strong>
                    <span>笔记页数</span>
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
                        <stop stopColor="var(--theme-accent-text)" stopOpacity=".32" />
                        <stop offset="1" stopColor="var(--theme-accent-text)" stopOpacity=".02" />
                      </linearGradient>
                    </defs>
                    <path d={`${chartLine} L515 128 L5 128Z`} fill="url(#area)" />
                    <path d={chartLine} fill="none" stroke="var(--theme-accent-text)" strokeWidth="2.5" />
                    {chartPoints.map(({ x, y }, index) => (
                      <circle
                        key={index}
                        cx={x}
                        cy={y}
                        r="3.3"
                        fill="var(--theme-panel)"
                        stroke="var(--theme-accent-text)"
                        strokeWidth="2"
                        tabIndex={0}
                        aria-label={`${chartDates[index]}，专注 ${formatDuration(chartValues[index])}`}
                        onMouseEnter={() => setHoveredPoint(index)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onFocus={() => setHoveredPoint(index)}
                        onBlur={() => setHoveredPoint(null)}
                      >
                        <title>
                          {chartDates[index]} · 专注 {formatDuration(chartValues[index])}
                        </title>
                      </circle>
                    ))}
                  </svg>
                  {hoveredPoint !== null && (
                    <div
                      className="chart-tooltip"
                      style={{ left: `${(chartPoints[hoveredPoint].x / 520) * 100}%` }}
                    >
                      {chartDates[hoveredPoint]} · 专注 {formatDuration(chartValues[hoveredPoint])}
                    </div>
                  )}
                  <div className="chart-labels">
                    {chartDates.filter((_, index) => index % 2 === 0).map((label) => (
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
                        <button key={note.id} onClick={() => openNote(note, pdfContents.get(note.id)?.some((text) => text.includes(activeKeyword.text)) ? activeKeyword.text : '')}>
                          <FileText size={16} /> {note.title} <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="word-cloud" aria-label={`最近 ${keywordPeriod} 天关键词`}>
                    {!keywords.length && <p className="keyword-cloud-empty">{pdfIndexing ? '正在读取 PDF 正文…' : '这个时间段还没有关键词'}</p>}
                    {keywords.map((keyword, index) => {
                      const [x, y, size] = keywordSlots[index]
                      return (
                        <button
                          key={keyword.text}
                          className={`word ${index < 2 ? 'core' : index < 5 ? 'secondary' : 'auxiliary'}`}
                          style={{
                            left: `${x}%`, top: `${y}%`, fontSize: size
                          }}
                          title={`出现 ${keyword.count} 次 · 关联 ${keyword.noteIds.length} 篇笔记 · 最近记录于 ${new Date(keyword.latest).toLocaleDateString('zh-CN')}`}
                          onClick={() => setActiveKeyword(keyword)}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setKeywordToBlock(keyword.text)
                          }}
                        >
                          {keyword.text}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="keyword-footnote">点击查看相关笔记 · 右键屏蔽关键词</div>
              </section>
            </div>
          </div>
        ) : screen === 'focus' ? (
          <section className="recent-page" aria-label="专注时间统计">
            <div className="recent-page-top"><button className="back-link" onClick={() => setScreen('home')}><ChevronLeft size={18} /> 返回首页</button>{focusPeriodButtons}</div>
            <div className="recent-page-heading"><div><h1>专注时间</h1><p>近 {chartPeriod} 天 · 笔记累计专注时间前 10 名</p></div><span>{formatDuration(focusMs)}</span></div>
            <div className="recent-file-list">
              {focusRanking.length ? <ol className="focus-ranking">{focusRanking.slice(0, 10).map(({ note, ms }, index) => (
                <li key={note.id}><button className="recent-file-row" onClick={() => openNote(note)}>
                  <span className="file-symbol">{index + 1}</span><span className="file-main"><strong>{note.title}</strong><small>{note.folder}</small></span><span>{formatDuration(ms)}</span>
                </button></li>
              ))}</ol> : <p className="recent-list-empty">这段时间还没有专注记录。</p>}
            </div>
          </section>
        ) : screen === 'trash' ? (
          <section className="recent-page" aria-label="回收站">
            <div className="recent-page-heading">
              <div><h1>回收站</h1><p>移入 30 天后自动清除。到期前可还原到原文件夹。</p></div>
              <span>{notes.filter((note) => note.trashed).length} 篇笔记</span>
            </div>
            <div className="recent-file-list">
              {notes.some((note) => note.trashed) ? (
                <ul className="trash-list">
                  {notes.filter((note) => note.trashed).map((note) => (
                    <li className="trash-row" key={note.id}>
                      <span className="file-symbol"><NoteFileIcon kind={note.kind} /></span>
                      <span className="file-main">
                        <strong>{note.title.trim() || '未命名笔记'}</strong>
                        <small>原位置 · {note.folder}</small>
                        {note.trashedAt !== undefined && <small>剩余 {Math.max(0, Math.ceil((note.trashedAt + TRASH_RETENTION_MS - Date.now()) / 86400000))} 天</small>}
                      </span>
                      <button
                        className="recent-create"
                        aria-label={`还原 ${note.title.trim() || '未命名笔记'}`}
                        onClick={() => restoreNote(note.id)}
                      >还原</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="recent-list-empty">回收站为空</p>}
            </div>
          </section>
        ) : screen === 'recent' || screen === 'folder' || screen === 'favorites' ? (
          <RecentFilesView
            layout={preferences.fileLayout}
            favorites={screen === 'favorites'}
            folder={screen === 'folder' ? selectedFolder ?? undefined : undefined}
            subfolders={screen === 'folder' && selectedFolder ? folders.filter((path) =>
              path.startsWith(`${selectedFolder} / `) && !path.slice(selectedFolder.length + 3).includes(' / ')
            ) : []}
            onOpenFolder={openFolder}
            renderActions={(file) => {
              const note = notes.find((entry) => entry.id === file.id)
              return note && <>
                <button className="recent-file-menu-toggle" aria-label={`${note.title} 更多操作`} aria-expanded={cardMenu === note.id} onClick={() => setCardMenu(cardMenu === note.id ? null : note.id)}>
                  <MoreHorizontal size={18} />
                </button>
                {cardMenu === note.id && renderNoteMenu(note)}
              </>
            }}
            files={[
              ...notes
                .filter((note) => !note.trashed && (screen !== 'folder' || note.folder === selectedFolder) && (screen !== 'favorites' || note.favorite))
                .map((note): RecentFile => ({
                  id: note.id,
                  title: note.title,
                  kind: note.kind === 'pdf' || note.kind === 'image' ? note.kind : 'note' as const,
                  folder: note.folder,
                  date: noteDate(note),
                  dateDetail: noteDateDetail(note),
                  summary: note.summary,
                  searchable: [...note.tags, ...(searchText.get(note.id) ?? [])],
                  favorite: note.favorite,
                  managed: true
                })),
            ]}
            onBack={() => {
              setScreen('home')
              setSelectedFolder(null)
              setSelectedNav('首页')
            }}
            onCreate={createNote}
            onCreateMarkdown={createMarkdownNote}
            onOpen={(file, term) => {
              const note = notes.find((entry) => entry.id === file.id)
              if (note) openNote(note, term && matchesNoteSearch(pdfContents.get(note.id) ?? [], term) ? term : '')
              else setToast('这篇笔记已不存在')
            }}
          />
        ) : screen === 'tags' ? (
          <TagsView
            notes={libraryNotes.map((note) => ({ ...note, date: noteDate(note), searchable: searchText.get(note.id) }))}
            catalog={tagCatalog}
            onCreateTag={(tag) => setTagCatalog((current) => [...new Set([...current, tag])])}
            onChangeTag={(from, to) => {
              setTagCatalog((current) => [...new Set([...current.filter((tag) => tag !== from), ...(to ? [to] : [])])])
              setNotes((current) => current.map((note) => note.tags.includes(from)
                ? { ...note, tags: [...new Set(note.tags.flatMap((tag) => tag === from ? to ? [to] : [] : [tag]))], updatedAt: Date.now() }
                : note))
            }}
            onSetNoteTags={(id, tags) => updateNote(id, { tags })}
            onBack={() => {
              setSelectedNav('首页')
              setScreen('home')
            }}
            onOpen={(id, term) => {
              const note = notes.find((entry) => entry.id === id)
              if (note) openNote(note, term && matchesNoteSearch(pdfContents.get(note.id) ?? [], term) ? term : '')
            }}
          />
        ) : screen === 'agenda' ? (
          <AgendaView
            items={agendaItems}
            selectedDate={selectedDate}
            onBack={() => setScreen('home')}
            onSelectDate={(date) => {
              const [year, monthNumber, day] = date.split('-').map(Number)
              selectCalendarDate(year * 12 + monthNumber - 1, day)
            }}
            onToggle={(id) => completeAgenda(id, !agendaItems.find((item) => item.id === id)?.done)}
            onOpenNote={(item) => { if (item.noteId) openLinkedNote(item.noteId, item.id) }}
            onAdd={() => openAgendaForm()}
            onEdit={(item) => openAgendaForm(item)}
            onDelete={confirmAgendaDelete}
            goals={<section className="agenda-timeline-panel agenda-goals" aria-label="目标">
              <div className="agenda-panel-heading">
                <h2>目标</h2>
                <span>{goals.filter((goal) => goal.done).length} / {goals.length}</span>
                <button className="agenda-add-goal" onClick={() => openGoalForm()}><Plus size={15} /> 新增目标</button>
              </div>
              <div className="agenda-goal-list">{goalRows(true)}</div>
            </section>}
          />
        ) : screen === 'settings' ? (
          <LibrarySettings profile={profile} onProfile={setProfile} folders={folders} onFolder={changeFolder}
            preferences={preferences} onPreferences={(patch) => setPreferences((current) => ({ ...current, ...patch }))}
            initialSection={settingsSection} onTestInput={() => { setSettingsSection('devices'); setScreen('pen-poc') }}
            onReset={() => setPreferences({})} lastBackup={lastBackup} lastSaved={lastSaved}
            blockedKeywords={blockedKeywords} onUnblock={(word) => setBlockedKeywords((current) => current.filter((entry) => entry !== word))}
            onBack={() => { setScreen('home'); setSelectedNav('首页') }}
            onBackup={(toDirectory) => void backupLibrary(undefined, toDirectory)} onRestore={() => libraryInput.current?.click()}
            onVaultOperation={(operation) => { void runVaultAction(operation) }}
            onClean={() => void cleanLibrary()} busy={libraryBusy || !notesReady} switching={libraryBusy} />
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
            onFocusTime={addFocusTime}
            importBusy={newNoteBusy}
            onImport={(files) => void createNoteFromFile(files)}
          />
        ) : screen === 'pen-poc' ? (
          <PenInputPocView onBack={() => setScreen('settings')} />
        ) : activeNote?.kind === 'markdown' ? (
          <MarkdownNoteEditor key={activeNote.id} note={activeNote} folders={folders}
            tagCatalog={[...new Set([...tagCatalog, ...notes.flatMap((item) => item.tags)])]}
            onTagsChange={(tags) => updateNote(activeNote.id, { tags })} onCreateTag={(tag) => setTagCatalog((current) => [...new Set([...current, tag])])}
            onBack={() => { setScreen(editorReturn); setActiveNoteId(null) }}
            onTitleChange={(title) => updateNote(activeNote.id, { title })}
            onFolderChange={(folder) => updateNote(activeNote.id, { folder })}
            saveDraft={draftNote?.id === activeNote.id ? (document) => persistDraft(activeNote, document) : undefined}
            onDocumentSaved={updateDocumentStats} onFocusTime={addFocusTime}
          />
        ) : activeNote ? (
          <LiveNoteEditorView
            key={activeNote.id}
            note={activeNote}
            folders={folders}
            otherNotes={notes.filter((entry) => entry.id !== activeNote.id && !entry.trashed )}
            preferences={preferences}
            onBrushPreferences={(patch) => setPreferences((current) => ({ ...current, ...patch }))}
            tagCatalog={[...new Set([...tagCatalog, ...notes.flatMap((item) => item.tags)])]}
            onTagsChange={(tags) => updateNote(activeNote.id, { tags })} onCreateTag={(tag) => setTagCatalog((current) => [...new Set([...current, tag])])}
            renderCompanion={(id, close) => {
              const companion = notes.find((entry) => entry.id === id && !entry.trashed)
              if (!companion) return <p>来源笔记已不存在</p>
              const activation = { active: focusNoteId === id, onActivate: () => setFocusNoteId(id), onFocusTime: addFocusTime }
              return companion.workspace ? <QuickWorkspaceView key={id} kind={companion.workspace} initialNote={companion}
                onBack={close} onSave={(title, kind, summary, draft) => saveQuickNote(title, kind, summary, draft, id, true)}
                importBusy={false} onImport={() => undefined} {...activation} />
                : <MarkdownNoteEditor key={id} note={companion} folders={folders} onBack={close}
                  tagCatalog={[...new Set([...tagCatalog, ...notes.flatMap((item) => item.tags)])]}
                  onTagsChange={(tags) => updateNote(id, { tags })} onCreateTag={(tag) => setTagCatalog((current) => [...new Set([...current, tag])])}
                  onTitleChange={(title) => updateNote(id, { title })} onFolderChange={(folder) => updateNote(id, { folder })}
                  onDocumentSaved={updateDocumentStats} {...activation} />
            }}
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
            saveDraft={draftNote?.id === activeNote.id ? (document) => persistDraft(activeNote, document) : undefined}
            onDocumentSaved={updateDocumentStats}
            onFocusTime={addFocusTime}
            initialPdfQuery={initialPdfQuery}
            initialCountdown={agendaItems.find((item) => item.id === activeAgendaId)?.minutes}
            onCountdownComplete={activeAgendaId && agendaItems.find((item) => item.id === activeAgendaId)?.minutes
              ? () => { completeAgenda(activeAgendaId, true); setToast('限时日程已完成') } : undefined}
            onPdfTextChanged={(id) => { indexedPdfVersions.current.delete(id) }}
            onActivate={setFocusNoteId}
            focusNoteId={focusNoteId}
            onChangeOtherNote={updateNote}
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
              onClick={() => { const today = new Date(); selectCalendarDate(calendarMonth(today), today.getDate()) }}
            >
              <CalendarDays size={15} /> 今天
            </button>
            <strong key={monthOffset} className={monthDirection ? 'calendar-month-label' : ''}>
              {month.getFullYear()} 年 {month.getMonth() + 1} 月
            </strong>
            <div className="calendar-arrows">
              <button
                aria-label="上一月"
                onClick={() => selectCalendarDate(monthOffset - 1, 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                aria-label="下一月"
                onClick={() => selectCalendarDate(monthOffset + 1, 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div
            className="calendar-frame"
            style={{ '--calendar-rows': 1 + Math.ceil((firstWeekday + days) / 7) } as React.CSSProperties}
          >
            <div key={monthOffset} className="calendar-grid" data-month-direction={monthDirection ?? undefined}>
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                <span className="weekday" key={d}>
                  {d}
                </span>
              ))}
              {Array.from({ length: firstWeekday }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const planned = agendaItems.some((item) => item.date === dayKey(new Date(month.getFullYear(), month.getMonth(), i + 1)))
                return (
                <button
                  key={i}
                  className={selectedDay === i + 1 ? 'selected-day' : ''}
                  title={planned ? '有日程' : undefined}
                  aria-pressed={selectedDay === i + 1}
                  onClick={() => setSelectedDay(i + 1)}
                >
                  {i + 1}{planned && <i className="agenda-date-dot" aria-label="有日程" />}
                </button>
              )})}
            </div>
          </div>
          <div className="schedule">
            <div className="section-title">
              <h2>
                {selectedDate === dayKey(new Date())
                  ? '今日日程'
                  : `${month.getMonth() + 1} 月 ${selectedDay} 日日程`}{' '}
                <span className="count">{dayAgenda.length}</span>
              </h2>
              <div className="schedule-actions">
                <button aria-label="新增日程" onClick={() => openAgendaForm()}>
                  <Plus size={23} />
                </button>
                <button
                  aria-label="查看全部日程"
                  title="查看全部日程"
                  onClick={() => setScreen('agenda')}
                >
                  <MoreHorizontal size={21} />
                </button>
              </div>
            </div>
            <div key={selectedDate} className="agenda-day-items date-enter">
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
                      <span>{item.time || '全天'}</span>
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
                      onClick={() => confirmAgendaDelete(item.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-day">这一天暂无日程</p>
              )}
            </div>
          </div>
          <div className="goals">
            <div className="section-title">
              <h2>目标</h2>
              <span>{goals.filter((goal) => goal.done).length} / {goals.length}</span>
              <button aria-label="新增目标" onClick={() => openGoalForm()}><Plus size={18} /></button>
            </div>
            <div className="progress">
              <i style={{ width: `${goals.length ? goals.filter((goal) => goal.done).length / goals.length * 100 : 0}%` }} />
            </div>
            {goalRows(false, goals.slice(0, 3))}
            {goals.length > 3 && (
              <details className="home-goals-more" open={showAllGoals} onToggle={(event) => setShowAllGoals(event.currentTarget.open)}>
                <summary><ChevronDown size={14} /> 其余 {goals.length - 3} 项</summary>
                <div>{goalRows(false, goals.slice(3))}</div>
              </details>
            )}
          </div>
        </section>
      )}

      <Dialog.Root open={!!folderAction} onOpenChange={(open) => { if (!open) setFolderAction(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          {folderAction && <Dialog.Content className="dialog-content glass folder-action-dialog" onCloseAutoFocus={(event) => {
            event.preventDefault()
            const trigger = folderActionTrigger.current
            if (trigger?.isConnected) trigger.focus()
            else addFolderButton.current?.focus()
          }}>
            <form onSubmit={(event) => { event.preventDefault(); submitFolderAction(folderAction) }}>
              <Dialog.Title>{folderAction.kind === 'rename' ? '重命名文件夹' : folderAction.kind === 'delete' ? '删除文件夹' : folderAction.parent ? '新建子文件夹' : '新建文件夹'}</Dialog.Title>
              <Dialog.Description>{folderAction.kind === 'delete'
                ? `「${folderAction.path}」及其子文件夹将被删除，里面的笔记会移至「${parentFolder(folderAction.path) || '未分类'}」。`
                : `位置：${folderAction.kind === 'create' ? folderAction.parent || '文件目录' : parentFolder(folderAction.path) || '文件目录'}`}</Dialog.Description>
              {folderAction.kind !== 'delete' && <label className="form-field">文件夹名称
                <input autoFocus value={folderName} maxLength={80} onChange={(event) => { setFolderName(event.target.value); setFolderError('') }} />
              </label>}
              {folderError && <p role="alert" className="folder-delete">{folderError}</p>}
              <div className="folder-dialog-actions">
                <Dialog.Close type="button" className="folder-dialog-cancel">取消</Dialog.Close>
                <button type="submit" className={folderAction.kind === 'delete' ? 'form-submit folder-confirm-delete' : 'form-submit'}>
                  {folderAction.kind === 'delete' ? '确认删除' : folderAction.kind === 'rename' ? '保存名称' : '创建文件夹'}
                </button>
              </div>
            </form>
          </Dialog.Content>}
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={globalSearchOpen} onOpenChange={(open) => {
        setGlobalSearchOpen(open)
        if (!open) { setSearchOpen(false); setQuery('') }
      }}>
        <Dialog.Portal container={document.fullscreenElement}>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content glass global-search-dialog" aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              const target = searchReturnFocus.current
              searchReturnFocus.current = null
              if (target?.isConnected) { event.preventDefault(); target.focus() }
            }}>
            <Dialog.Title>全局搜索</Dialog.Title>
            {searchBox}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
            {modal === '日程通知' ? (
              <><Dialog.Title>日程通知</Dialog.Title>
                {!profile.reminders ? <p>日程提醒已在设置中关闭。</p> : (() => {
                  const pending = agendaItems.filter((item) => !item.done && item.date === dayKey(new Date())).sort((a, b) => a.time.localeCompare(b.time))
                  return pending.length ? <ul>{pending.map((item) => <li key={item.id}>{item.time || '全天'} · {item.title}</li>)}</ul> : <p>今天没有待完成的日程。</p>
                })()}
                <button className="primary-button" onClick={() => {
                  const today = new Date()
                  selectCalendarDate(calendarMonth(today), today.getDate())
                  setModal(null)
                  setScreen('agenda')
                }}>查看今日日程</button>
              </>
            ) : modal === '重命名笔记' && operationNoteId ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (draftTitle.trim()) {
                    updateNote(operationNoteId, { title: draftTitle.trim() })
                    setModal(null)
                    setToast('笔记已重命名')
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
                  setToast(`已移至「${moveTarget}」`)
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
            ) : modal === '删除日程' || modal === '删除目标' ? (
              <>
                <Dialog.Title>{modal}</Dialog.Title>
                <p>确定删除「{modal === '删除日程' ? pendingAgendaDelete?.title : goalDraft.title}」？</p>
                <div className="dialog-options">
                  <button onClick={() => setModal(null)}>取消</button>
                  <button onClick={() => {
                    if (modal === '删除日程') setAgendaItems((current) => current.filter((item) => item.id !== pendingAgendaDelete?.id))
                    else setGoals((current) => current.filter((goal) => goal.id !== goalDraft.id))
                    setModal(null)
                  }}>确认删除</button>
                </div>
              </>
            ) : modal === '新增目标' || modal === '编辑目标' ? (
              <form onSubmit={(event) => {
                event.preventDefault()
                const title = goalDraft.title.trim()
                if (!title) return
                setGoals((current) => goalDraft.id
                  ? current.map((goal) => goal.id === goalDraft.id ? { ...goal, title, noteId: goalDraft.noteId || undefined } : goal)
                  : [...current, { id: crypto.randomUUID(), title, done: false, noteId: goalDraft.noteId || undefined }])
                setModal(null)
              }}>
                <Dialog.Title>{modal}</Dialog.Title>
                <label className="form-field">目标名称<input autoFocus required maxLength={100} value={goalDraft.title} onChange={(event) => setGoalDraft((draft) => ({ ...draft, title: event.target.value }))} /></label>
                <label className="form-field">关联笔记<select value={goalDraft.noteId} onChange={(event) => setGoalDraft((draft) => ({ ...draft, noteId: event.target.value }))}>
                  <option value="">不关联</option>{libraryNotes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
                </select></label>
                <button className="form-submit" type="submit">保存目标</button>
              </form>
            ) : modal === '新增日程' || modal === '修改日程' ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!agendaDraft.title.trim()) return
                  const links = { noteId: agendaDraft.noteId || undefined, goalId: agendaDraft.goalId || undefined,
                    minutes: agendaDraft.noteId && agendaDraft.minutes ? Number(agendaDraft.minutes) : undefined }
                  if (agendaDraft.id)
                    setAgendaItems((items) =>
                      items.map((item) =>
                        item.id === agendaDraft.id
                          ? { ...item, ...links, time: agendaDraft.time, title: agendaDraft.title.trim() }
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
                        ...links,
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
                  <select aria-label="日程时间类型" value={agendaDraft.time ? 'timed' : 'all-day'} onChange={(event) => setAgendaDraft((draft) => ({ ...draft, time: event.target.value === 'all-day' ? '' : '09:00' }))}>
                    <option value="all-day">全天</option>
                    <option value="timed">指定时间</option>
                  </select>
                  {agendaDraft.time && <input
                    aria-label="具体时间"
                    type="time"
                    value={agendaDraft.time}
                    onChange={(event) =>
                      setAgendaDraft((draft) => ({ ...draft, time: event.target.value }))
                    }
                    required
                  />}
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
                    maxLength={100}
                    required
                  />
                </label>
                <label className="form-field">关联笔记<select value={agendaDraft.noteId} onChange={(event) => setAgendaDraft((draft) => ({ ...draft, noteId: event.target.value, minutes: '' }))}>
                  <option value="">不关联</option>{libraryNotes.map((note) => <option key={note.id} value={note.id}>{note.title}</option>)}
                </select></label>
                <label className="form-field">关联目标<select value={agendaDraft.goalId} onChange={(event) => setAgendaDraft((draft) => ({ ...draft, goalId: event.target.value }))}>
                  <option value="">不关联</option>{goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                </select></label>
                {libraryNotes.some((note) => note.id === agendaDraft.noteId && !note.workspace && note.kind !== 'markdown') &&
                  <label className="form-field">限时分钟数（倒计时结束后完成日程）<input type="number" min="1" max="180" value={agendaDraft.minutes}
                    onChange={(event) => setAgendaDraft((draft) => ({ ...draft, minutes: event.target.value }))} /></label>}
                <button className="form-submit" type="submit">
                  {agendaDraft.id ? '保存修改' : '添加日程'}
                </button>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={vaultBusy}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content" onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
            <Dialog.Title>正在处理资料库</Dialog.Title>
            <Dialog.Description>请选择所需文件夹，复制与校验完成后将继续。</Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={keywordToBlock !== null} onOpenChange={(open) => { if (!open) setKeywordToBlock(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>屏蔽关键词</Dialog.Title>
            <Dialog.Description>屏蔽「{keywordToBlock}」后，可在「设置 → 通用」恢复显示。</Dialog.Description>
            <div className="dialog-options">
              <Dialog.Close asChild><button type="button">取消</button></Dialog.Close>
              <button type="button" onClick={() => {
                if (!keywordToBlock) return
                setBlockedKeywords((current) => [...new Set([...current, keywordToBlock])])
                setKeywordToBlock(null)
              }}>不再显示此词</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {homeDropActive && screen === 'home' && (
        <div className="home-pdf-drop" aria-hidden="true"><FileText size={28} />松开以导入 PDF 或图片</div>
      )}
      {(toast || trashUndoId || pdfImportStatus) && (
        <div className="toast" role="status">
          {indexSaveError || indexLoadError
            ? toast || '笔记目录保存失败'
            : pdfImportStatus || (trashUndoId ? '已移入回收站' : toast)}
          {trashUndoId && (
            <button onClick={() => restoreNote(trashUndoId)}>撤销移入回收站</button>
          )}
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
