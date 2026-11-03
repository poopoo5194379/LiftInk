export type InkPoint = { x: number; y: number; pressure: number }
export type InkElement = {
  kind: 'ink'
  id: string
  color: string
  width: number
  points: InkPoint[]
}
export type ImageElement = {
  kind: 'image'
  id: string
  assetId: string
  x: number
  y: number
  width: number
  height: number
}
export type PageElement = InkElement | ImageElement
export type PaperKind = 'lines' | 'grid' | 'blank'
export type NotePage = { id: string; paper: PaperKind; elements: PageElement[] }
export type NoteDocument = { version: 1; noteId: string; pages: NotePage[] }
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
  workspace?: 'voice' | 'import' | 'mindmap' | 'whiteboard'
  draft?: { transcript: string; nodes: string[]; boardItems: string[] }
  trashed?: boolean
}
export type CapturedScreen = { dataUrl: string; width: number; height: number; label: string }
export type StoredImage = { assetId: string; dataUrl: string }
export type StorageLoad<T> = { value: T | null; recovered: boolean }
