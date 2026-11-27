import { randomUUID } from 'crypto'
import { dirname, join } from 'path'
import { mkdir, open, readFile, readdir, rename, stat, unlink } from 'fs/promises'
import type { AudioTranscript, NoteDocument, NoteRecord, Recording, StorageLoad } from '../shared/editor'
import { referencedAssets } from '../shared/noteResources'
import { MAX_NOTE_PAGES, TRASH_RETENTION_MS } from '../shared/editor'

const noteIdPattern = /^[A-Za-z0-9_-]{1,96}$/
const assetIdPattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/
const mediaIdPattern = /^[a-f0-9]{64}\.(pdf|webm)$/

export function validNoteId(id: unknown): id is string {
  return typeof id === 'string' && noteIdPattern.test(id)
}

function validTranscript(transcript: AudioTranscript, assetId?: string): boolean {
  return !!transcript && transcript.assetId === assetId && typeof transcript.text === 'string' &&
    transcript.text.length <= 150_000 && Array.isArray(transcript.segments) && transcript.segments.length <= 4000 &&
    transcript.segments.every((segment) => segment && Number.isFinite(segment.start) && segment.start >= 0 &&
      (segment.end === null || (Number.isFinite(segment.end) && segment.end >= segment.start)) &&
      typeof segment.text === 'string' && segment.text.length <= 5000)
}

function validRecordings(value?: Recording[]): boolean {
  return value === undefined || (Array.isArray(value) && value.length <= 500 && value.every((item) =>
    !!item && validNoteId(item.id) && /^[a-f0-9]{64}\.webm$/.test(item.assetId) &&
    Number.isFinite(item.startedAt) && item.startedAt >= 0 &&
    (item.endedAt === undefined || (Number.isFinite(item.endedAt) && item.endedAt >= item.startedAt)) &&
    (item.transcript === undefined || validTranscript(item.transcript, item.assetId))))
}

export function validNoteRecord(value: unknown): value is NoteRecord {
  if (!value || typeof value !== 'object') return false
  const note = value as NoteRecord
  return (
    validNoteId(note.id) &&
    [note.title, note.originalTitle, note.date, note.kind, note.folder, note.summary].every(
      (item) => typeof item === 'string' && item.length <= 10000
    ) &&
    typeof note.favorite === 'boolean' &&
    Array.isArray(note.tags) &&
    note.tags.length <= 100 &&
    note.tags.every((tag) => typeof tag === 'string' && tag.length <= 200) &&
    (note.workspace === undefined ||
      ['voice', 'import', 'mindmap', 'whiteboard'].includes(note.workspace)) &&
    (note.trashed === undefined || typeof note.trashed === 'boolean') &&
    [note.trashedAt, note.createdAt, note.updatedAt].every((date) =>
      date === undefined || (Number.isSafeInteger(date) && date >= 0 && date <= 8.64e15)
    ) &&
    (note.pageCount === undefined || (Number.isInteger(note.pageCount) && note.pageCount >= 0 && note.pageCount <= MAX_NOTE_PAGES)) &&
    (note.focusByDay === undefined ||
      (note.focusByDay !== null && typeof note.focusByDay === 'object' && !Array.isArray(note.focusByDay) &&
        Object.entries(note.focusByDay).every(([day, ms]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isSafeInteger(ms) && ms >= 0))) &&
    (note.documentExpected === undefined || typeof note.documentExpected === 'boolean') &&
    (note.draft === undefined || (!!note.draft && validRecordings(note.draft.recordings)))
  )
}

export function validIndex(value: unknown): value is NoteRecord[] | { version: 1; notes: NoteRecord[] } {
  const notes = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && (value as { version?: unknown }).version === 1
      ? (value as { notes?: unknown }).notes
      : null
  return (
    Array.isArray(notes) &&
    notes.length <= 10000 &&
    notes.every(validNoteRecord) &&
    JSON.stringify(value).length <= 5_000_000
  )
}

export function validDocument(value: unknown, id: string): value is NoteDocument {
  if (!value || typeof value !== 'object') return false
  const document = value as NoteDocument
  if (document.version !== 1 || document.noteId !== id || !Array.isArray(document.pages))
    return false
  if (document.revision !== undefined && (!Number.isSafeInteger(document.revision) || document.revision < 0)) return false
  if (document.pages.length < 1 || document.pages.length > MAX_NOTE_PAGES) return false
  if (document.sourcePdfId !== undefined && !mediaIdPattern.test(document.sourcePdfId)) return false
  if (document.sourcePdfIds !== undefined && (!Array.isArray(document.sourcePdfIds) || document.sourcePdfIds.length > 100 || !document.sourcePdfIds.every((item) => typeof item === 'string' && item.endsWith('.pdf') && mediaIdPattern.test(item)))) return false
  if (document.audioAssetId !== undefined && !mediaIdPattern.test(document.audioAssetId)) return false
  if (document.audioStartedAt !== undefined && (!Number.isFinite(document.audioStartedAt) || document.audioStartedAt < 0)) return false
  if (document.audioTranscript !== undefined && !validTranscript(document.audioTranscript, document.audioAssetId)) return false
  if (!validRecordings(document.recordings)) return false
  if (document.richText !== undefined && (typeof document.richText !== 'string' || document.richText.length > 2_000_000)) return false
  if (document.excerpts !== undefined && (!Array.isArray(document.excerpts) || document.excerpts.length > 10000 || !document.excerpts.every((entry) => validNoteId(entry.id) && validNoteId(entry.pageId) && validNoteId(entry.elementId) && validNoteId(entry.sourceNoteId) && validNoteId(entry.sourcePageId)))) return false
  return document.pages.every(
    (page) =>
      validNoteId(page.id) &&
      ['lines', 'grid', 'blank', 'dots'].includes(page.paper) &&
      (page.paperColor === undefined || ['white', 'cream', 'gray'].includes(page.paperColor)) &&
      (page.autoContinuation === undefined || page.autoContinuation === true) &&
      (page.size === undefined || (page.size !== null && [page.size.width, page.size.height].every((side) => Number.isFinite(side) && side >= 1 && side <= 2000))) &&
      (page.paperSpacing === undefined || ['compact', 'standard', 'wide'].includes(page.paperSpacing)) &&
      (page.backgroundAssetId === undefined || assetIdPattern.test(page.backgroundAssetId)) &&
      (page.sourcePdfId === undefined || (page.sourcePdfId.endsWith('.pdf') && mediaIdPattern.test(page.sourcePdfId))) &&
      (page.sourcePageNumber === undefined || (Number.isSafeInteger(page.sourcePageNumber) && page.sourcePageNumber > 0)) &&
      (page.recognizedInk === undefined || (!!page.recognizedInk && typeof page.recognizedInk.text === 'string' && page.recognizedInk.text.length <= 24_000 &&
        typeof page.recognizedInk.signature === 'string' && /^[a-f0-9]{64}$/.test(page.recognizedInk.signature))) &&
      (page.bookmark === undefined || (typeof page.bookmark === 'string' && page.bookmark.length <= 200)) &&
      (page.layers === undefined || (Array.isArray(page.layers) && page.layers.length <= 20 && page.layers.every((layer) => validNoteId(layer.id) && typeof layer.name === 'string' && layer.name.length <= 100 && typeof layer.visible === 'boolean' && typeof layer.locked === 'boolean'))) &&
      Array.isArray(page.elements) &&
      page.elements.length <= 100000 &&
      page.elements.every((element) =>
        (element.layerId === undefined || validNoteId(element.layerId)) && (element.kind === 'ink'
          ? validNoteId(element.id) &&
            typeof element.color === 'string' &&
            /^#[0-9a-fA-F]{6}$/.test(element.color) &&
            Number.isFinite(element.width) &&
            element.width > 0 &&
            element.width <= 100 &&
            (element.brush === undefined || element.brush === 'pen' || element.brush === 'highlighter') &&
            (element.pressureSensitive === undefined || typeof element.pressureSensitive === 'boolean') &&
            (element.penStyle === undefined || ['ballpoint', 'fountain', 'brush', 'fineliner'].includes(element.penStyle)) &&
            (element.stability === undefined || (Number.isFinite(element.stability) && element.stability >= 0 && element.stability <= 1)) &&
            (element.pressureCurve === undefined || (Number.isFinite(element.pressureCurve) && element.pressureCurve >= 0.5 && element.pressureCurve <= 2)) &&
            (element.inkVersion === undefined || element.inkVersion === 2 || element.inkVersion === 3) &&
            (element.pressureInput === undefined || ['pen', 'fixed'].includes(element.pressureInput)) &&
            Array.isArray(element.points) &&
            element.points.length <= 100000 &&
            (element.recordedAt === undefined || (Number.isFinite(element.recordedAt) && element.recordedAt >= 0)) &&
            element.points.every(
              (point) =>
                Number.isFinite(point.x) &&
                Number.isFinite(point.y) &&
                Number.isFinite(point.pressure)
            )
          : element.kind === 'image'
            ? validNoteId(element.id) && assetIdPattern.test(element.assetId) &&
              [element.x, element.y, element.width, element.height].every(Number.isFinite) &&
              element.width > 0 && element.height > 0 && element.width <= 20000 && element.height <= 20000
            : element.kind === 'text'
              ? validNoteId(element.id) && [element.x, element.y, element.width, element.fontSize].every(Number.isFinite) && element.width > 0 && element.width <= 20000 && element.fontSize > 0 && element.fontSize <= 200 && typeof element.text === 'string' && element.text.length <= 10000 && /^#[0-9a-fA-F]{6}$/.test(element.color) && (element.format === undefined || element.format === 'markdown') && (element.font === undefined || ['sans', 'serif', 'mono'].includes(element.font)) &&
                (element.height === undefined || (Number.isFinite(element.height) && element.height > 0 && element.height <= 20000)) &&
                (element.styles === undefined || (Array.isArray(element.styles) && element.styles.length <= element.text.length && element.styles.every((run, index, runs) =>
                  run && Number.isInteger(run.from) && Number.isInteger(run.to) && run.from >= (index ? runs[index - 1].to : 0) && run.to > run.from && run.to <= element.text.length &&
                  (run.font === undefined || ['sans', 'serif', 'mono'].includes(run.font)) && (run.color === undefined || (typeof run.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(run.color))))))
              : element.kind === 'shape'
                ? validNoteId(element.id) && [element.x, element.y, element.width, element.height, element.strokeWidth].every(Number.isFinite) && ['rect', 'ellipse', 'line'].includes(element.shape) && /^#[0-9a-fA-F]{6}$/.test(element.color)
                : element.kind === 'tape' && validNoteId(element.id) && [element.x, element.y, element.width, element.height].every(Number.isFinite) && element.width > 0 && element.height > 0 && typeof element.revealed === 'boolean')
      )
  )
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function replaceAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx')
    try {
      await file.writeFile(data)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, path)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

function decode<T>(text: string | null, valid: (value: unknown) => value is T): T | null {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    return valid(value) ? value : null
  } catch {
    return null
  }
}

export class NoteStore {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly errors = new Map<string, Error>()
  private readonly purged = new Set<string>()

  constructor(private readonly root: () => string) {}

  private indexPath(): string {
    return join(this.root(), 'index.json')
  }

  private documentPath(id: string): string {
    return join(this.root(), 'notes', `${id}.json`)
  }

  private async afterWrites(path: string): Promise<void> {
    await this.queues.get(path)?.catch(() => undefined)
  }

  private enqueue(path: string, action: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(path) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(action)
      .then(
        () => {
          this.errors.delete(path)
        },
        (error: unknown) => {
          this.errors.set(path, error instanceof Error ? error : new Error(String(error)))
          throw error
        }
      )
    this.queues.set(path, next)
    void next
      .finally(() => {
        if (this.queues.get(path) === next) this.queues.delete(path)
      })
      .catch(() => undefined)
    return next
  }

  async flush(): Promise<void> {
    const pending = [...this.queues.values()]
    await Promise.allSettled(pending)
    if (this.errors.size > 0) throw new Error('有笔记或目录未能保存')
  }

  private async load<T>(
    path: string,
    valid: (value: unknown) => value is T
  ): Promise<StorageLoad<T>> {
    await this.afterWrites(path)
    const primaryText = await readText(path)
    const primary = decode(primaryText, valid)
    if (primary !== null) return { value: primary, recovered: false }
    const backupText = await readText(`${path}.bak`)
    const backup = decode(backupText, valid)
    if (primaryText === null && backupText === null) return { value: null, recovered: false }
    if (backup === null || backupText === null) throw new Error(`文件损坏，且没有有效备份：${path}`)
    await this.enqueue(path, async () => {
      if (primaryText !== null) await replaceAtomic(`${path}.corrupt-${randomUUID()}`, primaryText)
      await replaceAtomic(path, backupText)
    })
    return { value: backup, recovered: true }
  }

  private async save<T>(
    path: string,
    value: T,
    valid: (value: unknown) => value is T,
    serialized?: string,
    shouldWrite?: (previous: T | null) => boolean
  ): Promise<void> {
    const data = serialized ?? JSON.stringify(value)
    await this.enqueue(path, async () => {
      const oldText = await readText(path)
      const previous = decode(oldText, valid)
      if (oldText !== null) {
        if (previous === null)
          throw new Error('现有文件损坏，已阻止覆盖；请先恢复备份')
        if (shouldWrite && !shouldWrite(previous)) return
        await replaceAtomic(`${path}.bak`, oldText)
      }
      await replaceAtomic(path, data)
    })
  }

  async loadIndex(): Promise<StorageLoad<NoteRecord[]>> {
    const result = await this.load(this.indexPath(), validIndex)
    if (result.value !== null) await this.sweepTrash()
    const index = decode(await readText(this.indexPath()), validIndex)
    const indexed = index === null ? [] : Array.isArray(index) ? index : index.notes
    const knownIds = new Set(indexed.map((note) => note.id))
    const orphans: NoteRecord[] = []
    let filenames: string[] = []
    try {
      filenames = await readdir(join(this.root(), 'notes'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    for (const name of filenames) {
      const id = name.endsWith('.json.bak')
        ? name.slice(0, -'.json.bak'.length)
        : name.endsWith('.json')
          ? name.slice(0, -'.json'.length)
          : ''
      if (!validNoteId(id) || knownIds.has(id)) continue
      knownIds.add(id)
      orphans.push({
        id,
        title: `恢复的笔记 ${id.slice(0, 8)}`,
        originalTitle: `new-${id}`,
        date: '已恢复',
        tags: [],
        kind: 'blank',
        folder: '未分类',
        summary: '从未列入目录的本地文档找回，请核对内容并重命名',
        favorite: false,
        documentExpected: true
      })
    }
    const withDates = await Promise.all([...orphans, ...indexed].map(async (note) => {
      if (note.workspace) return note
      const path = this.documentPath(note.id)
      const info = await stat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (!info) return note
      const modified = Math.floor(info.mtimeMs)
      const updatedAt = Math.max(note.updatedAt ?? 0, modified)
      if (note.pageCount !== undefined && modified <= (note.updatedAt ?? 0)) return note
      const doc = decode(await readText(path), (value): value is NoteDocument => validDocument(value, note.id))
      return { ...note, updatedAt, pageCount: doc?.pages.length ?? note.pageCount }
    }))
    return {
      value: index === null && orphans.length === 0 ? null : withDates,
      recovered: result.recovered,
      orphanCount: orphans.length
    }
  }

  async sweepTrash(): Promise<string[]> {
    const path = this.indexPath()
    const expired: string[] = []
    await this.enqueue(path, async () => {
      const text = await readText(path)
      const index = decode(text, validIndex)
      if (index === null || text === null) return
      const notes = Array.isArray(index) ? index : index.notes
      const now = Date.now()
      const next: NoteRecord[] = []
      let changed = false
      for (const note of notes) {
        if (!note.trashed) next.push(note)
        else if (note.trashedAt === undefined) {
          changed = true
          next.push({ ...note, trashedAt: now })
        } else if (now - note.trashedAt < TRASH_RETENTION_MS) next.push(note)
        else {
          const documentPath = this.documentPath(note.id)
          this.purged.add(note.id)
          await this.enqueue(documentPath, async () => {
            // Remove the recovery copy first so an interrupted sweep can retry without
            // making a deleted document appear as a recovered note.
            for (const copy of [`${documentPath}.bak`, documentPath]) {
              await unlink(copy).catch((error: NodeJS.ErrnoException) => {
                if (error.code !== 'ENOENT') throw error
              })
            }
          }).catch((error) => { this.purged.delete(note.id); throw error })
          expired.push(note.id)
          changed = true
        }
      }
      if (changed) {
        await replaceAtomic(`${path}.bak`, text)
        await replaceAtomic(path, JSON.stringify({ version: 1, notes: next }))
      }
    })
    return expired
  }

  async cleanAssets(draftAssets: unknown): Promise<{ count: number; bytes: number }> {
    if (!Array.isArray(draftAssets) || draftAssets.length > 50_000 ||
        !draftAssets.every((id) => typeof id === 'string' && (assetIdPattern.test(id) || mediaIdPattern.test(id)))) {
      throw new Error('草稿附件清单无效')
    }
    await this.flush()
    const root = this.root()
    const list = (path: string): Promise<string[]> => readdir(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    })
    const assetDirectory = join(root, 'assets')
    const noteDirectory = join(root, 'notes')
    const protectedAssets = new Set<string>(draftAssets)
    for (const path of [this.indexPath(), `${this.indexPath()}.bak`]) {
      const raw = await readText(path)
      if (raw === null) continue
      const index = decode(raw, validIndex)
      if (index === null) throw new Error('笔记目录或其备份损坏，已停止清理')
      for (const note of Array.isArray(index) ? index : index.notes) {
        if (!this.purged.has(note.id) && !(note.trashed && note.trashedAt && Date.now() - note.trashedAt >= TRASH_RETENTION_MS)) {
          for (const id of referencedAssets(null, note)) protectedAssets.add(id)
        }
      }
    }
    for (const file of await list(noteDirectory)) {
      const match = /^([A-Za-z0-9_-]{1,96})\.json(?:\.bak)?$/.exec(file)
      if (!match) continue
      const raw = await readText(join(noteDirectory, file))
      if (raw === null) continue
      const document = decode(raw, (value): value is NoteDocument => validDocument(value, match[1]))
      if (!document) throw new Error('有笔记或其备份无法读取，已停止清理')
      for (const id of referencedAssets(document)) protectedAssets.add(id)
    }
    const cutoff = Date.now() - TRASH_RETENTION_MS
    let count = 0
    let bytes = 0
    for (const id of await list(assetDirectory)) {
      if (protectedAssets.has(id) || (!assetIdPattern.test(id) && !mediaIdPattern.test(id))) continue
      const path = join(assetDirectory, id)
      const info = await stat(path)
      if (!info.isFile() || info.mtimeMs >= cutoff) continue
      await unlink(path)
      count++
      bytes += info.size
      if (!id.endsWith('.pdf')) continue
      const ocr = join(root, 'ocr-v1', id.slice(0, 64))
      const cache = [join(root, 'pdf-text-v1', `${id}.json`),
        ...(await list(ocr)).filter((file) => /^\d+\.json$/.test(file)).map((file) => join(ocr, file))]
      for (const path of cache) await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
    }
    return { count, bytes }
  }

  async initializeNote(note: unknown, initial?: unknown): Promise<void> {
    if (!validNoteRecord(note) || note.workspace) throw new Error('新建笔记信息无效')
    if (this.purged.has(note.id)) throw new Error('笔记已从回收站清除')
    const path = this.documentPath(note.id)
    const document = initial === undefined ? {
      version: 1,
      noteId: note.id,
      revision: 0,
      pages: [{ id: randomUUID(), paper: 'lines', elements: [] }]
    } : initial
    if (!validDocument(document, note.id)) throw new Error('初始笔记文档无效')
    const data = JSON.stringify(document)
    if (data.length > 40_000_000) throw new Error('笔记文档过大')
    await this.enqueue(path, async () => {
      if ((await readText(path)) !== null || (await readText(`${path}.bak`)) !== null)
        throw new Error('笔记文档已存在，已阻止覆盖')
      await replaceAtomic(path, data)
    })
  }

  async saveIndex(notes: unknown): Promise<void> {
    const envelope = { version: 1, notes }
    if (!validIndex(envelope)) throw new Error('笔记目录无效')
    const path = this.indexPath()
    await this.enqueue(path, async () => {
      const previous = await readText(path)
      if (previous !== null) {
        if (decode(previous, validIndex) === null) throw new Error('现有目录损坏，已阻止覆盖')
        await replaceAtomic(`${path}.bak`, previous)
      }
      await replaceAtomic(path, JSON.stringify({
        ...envelope, notes: (notes as NoteRecord[]).filter((note) => !this.purged.has(note.id))
      }))
    })
  }

  async loadDocument(id: unknown): Promise<StorageLoad<NoteDocument>> {
    if (!validNoteId(id)) throw new Error('无效的笔记 ID')
    return this.load(this.documentPath(id), (value): value is NoteDocument =>
      validDocument(value, id)
    )
  }

  async saveDocument(document: unknown): Promise<void> {
    if (!document || typeof document !== 'object') throw new Error('笔记文档无效')
    const id = (document as NoteDocument).noteId
    if (!validNoteId(id) || !validDocument(document, id)) throw new Error('笔记文档无效')
    if (this.purged.has(id)) throw new Error('笔记已从回收站清除')
    const data = JSON.stringify(document)
    if (data.length > 40_000_000) throw new Error('笔记文档过大')
    await this.save(
      this.documentPath(id),
      document,
      (value): value is NoteDocument => validDocument(value, id),
      data,
      (previous) => !previous || (document.revision ?? 0) >= (previous.revision ?? 0)
    )
  }
}
