export const MAX_NOTE_PAGES = 300
export const MAX_PDF_BYTES = 120_000_000
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export type OpenedPdf = { name: string; bytes: Uint8Array } | { error: string }
export type PdfOcrWord = { text: string; x0: number; y0: number; x1: number; y1: number }
export type PdfOcrPage = { width: number; height: number; text: string; words: PdfOcrWord[] }
export type SpeechLanguage = 'zh' | 'en'
export type MindMapNode = { id: string; label: string; parentId?: string; collapsed?: boolean }
export type AudioTranscript = { assetId: string; language?: SpeechLanguage; text: string; segments: { start: number; end: number | null; text: string }[] }
export type Recording = { id: string; assetId: string; startedAt: number; endedAt?: number; transcript?: AudioTranscript }

export type InkPoint = { x: number; y: number; pressure: number }
export type PenStyle = 'ballpoint' | 'fountain' | 'brush' | 'fineliner'
export type InkElement = {
  kind: 'ink'
  id: string
  color: string
  width: number
  points: InkPoint[]
  brush?: 'pen' | 'highlighter'
  pressureSensitive?: boolean
  penStyle?: PenStyle
  stability?: number
  pressureCurve?: number
  inkVersion?: 2 | 3
  pressureInput?: 'pen' | 'fixed'
  recordedAt?: number
  layerId?: string
}
export type ImageElement = {
  kind: 'image'
  id: string
  assetId: string
  x: number
  y: number
  width: number
  height: number
  layerId?: string
}
export type CanvasTextFont = 'sans' | 'serif' | 'mono'
export type CanvasTextRange = { from: number; to: number; font?: CanvasTextFont; color?: string }
export type TextElement = { kind: 'text'; id: string; x: number; y: number; width: number; height?: number; text: string; color: string; fontSize: number; layerId?: string; format?: 'markdown'; font?: CanvasTextFont; styles?: CanvasTextRange[] }
export type ShapeElement = { kind: 'shape'; id: string; x: number; y: number; width: number; height: number; shape: 'rect' | 'ellipse' | 'line'; color: string; strokeWidth: number; layerId?: string }
export type TapeElement = { kind: 'tape'; id: string; x: number; y: number; width: number; height: number; revealed: boolean; layerId?: string }
export type PageElement = InkElement | ImageElement | TextElement | ShapeElement | TapeElement
export type PaperKind = 'lines' | 'grid' | 'blank' | 'dots'
export type PaperSpacing = 'compact' | 'standard' | 'wide'
export type PageSize = { width: number; height: number }
export type NotePage = { id: string; paper: PaperKind; paperColor?: 'white' | 'cream' | 'gray'; paperSpacing?: PaperSpacing; size?: PageSize; elements: PageElement[]; autoContinuation?: true; backgroundAssetId?: string; sourcePdfId?: string; sourcePageNumber?: number; bookmark?: string; recognizedInk?: { text: string; signature: string }; layers?: { id: string; name: string; visible: boolean; locked: boolean }[] }
export type NoteDocument = { version: 1; noteId: string; pages: NotePage[]; revision?: number; sourcePdfId?: string; sourcePdfIds?: string[]; audioAssetId?: string; audioStartedAt?: number; audioTranscript?: AudioTranscript; recordings?: Recording[]; richText?: string; excerpts?: { id: string; pageId: string; elementId: string; sourceNoteId: string; sourcePageId: string }[] }
export type NoteRecord = {
  id: string
  title: string
  originalTitle: string
  date: string
  tags: string[]
  kind: string
  folder: string
  summary: string
  favorite: boolean
  documentExpected?: boolean
  workspace?: 'voice' | 'import' | 'mindmap' | 'whiteboard'
  draft?: { transcript: string; nodes: string[]; boardItems: string[]; mindMap?: MindMapNode[]; audioAssetId?: string; audioTranscript?: AudioTranscript; recordings?: Recording[]; boardPage?: NotePage }
  trashed?: boolean
  trashedAt?: number
  createdAt?: number
  updatedAt?: number
  pageCount?: number
  focusByDay?: Record<string, number>
}
export type CapturedScreen = { dataUrl: string; width: number; height: number; label: string }
export type StoredImage = { assetId: string; dataUrl: string }
export type StoredMedia = { assetId: string; dataUrl: string }
export type StorageLoad<T> = { value: T | null; recovered: boolean; orphanCount?: number }
export type StorageInfo = { path: string; bytes: number; backupDirectory: string | null }
export type AppDiagnostics = { version: string; electron: string; chromium: string; platform: string; arch: string; gpu: string }
