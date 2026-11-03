import { randomUUID } from 'crypto'
import { dirname, join } from 'path'
import { mkdir, open, readFile, rename, unlink } from 'fs/promises'
import type { NoteDocument, NoteRecord, StorageLoad } from '../shared/editor'

const noteIdPattern = /^[A-Za-z0-9_-]{1,96}$/
const assetIdPattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/

export function validNoteId(id: unknown): id is string {
  return typeof id === 'string' && noteIdPattern.test(id)
}

function validNoteRecord(value: unknown): value is NoteRecord {
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
    (note.trashed === undefined || typeof note.trashed === 'boolean')
  )
}

function validIndex(value: unknown): value is NoteRecord[] | { version: 1; notes: NoteRecord[] } {
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
  if (document.pages.length < 1 || document.pages.length > 200) return false
  return document.pages.every(
    (page) =>
      validNoteId(page.id) &&
      ['lines', 'grid', 'blank'].includes(page.paper) &&
      Array.isArray(page.elements) &&
      page.elements.length <= 100000 &&
      page.elements.every((element) =>
        element.kind === 'ink'
          ? validNoteId(element.id) &&
            typeof element.color === 'string' &&
            /^#[0-9a-fA-F]{6}$/.test(element.color) &&
            Number.isFinite(element.width) &&
            element.width > 0 &&
            element.width <= 100 &&
            Array.isArray(element.points) &&
            element.points.length <= 100000 &&
            element.points.every(
              (point) =>
                Number.isFinite(point.x) &&
                Number.isFinite(point.y) &&
                Number.isFinite(point.pressure)
            )
          : element.kind === 'image' &&
            validNoteId(element.id) &&
            assetIdPattern.test(element.assetId) &&
            [element.x, element.y, element.width, element.height].every(Number.isFinite) &&
            element.width > 0 &&
            element.height > 0 &&
            element.width <= 20000 &&
            element.height <= 20000
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

async function replaceAtomic(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx')
    try {
      await file.writeFile(data, 'utf8')
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

  hasUnfinishedWork(): boolean {
    return this.queues.size > 0 || this.errors.size > 0
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
    serialized?: string
  ): Promise<void> {
    const data = serialized ?? JSON.stringify(value)
    await this.enqueue(path, async () => {
      const oldText = await readText(path)
      if (oldText !== null) {
        if (decode(oldText, valid) === null)
          throw new Error('现有文件损坏，已阻止覆盖；请先恢复备份')
        await replaceAtomic(`${path}.bak`, oldText)
      }
      await replaceAtomic(path, data)
    })
  }

  async loadIndex(): Promise<StorageLoad<NoteRecord[]>> {
    const result = await this.load(this.indexPath(), validIndex)
    return {
      value:
        result.value === null
          ? null
          : Array.isArray(result.value)
            ? result.value
            : result.value.notes,
      recovered: result.recovered
    }
  }

  async saveIndex(notes: unknown): Promise<void> {
    const envelope = { version: 1, notes }
    if (!validIndex(envelope)) throw new Error('笔记目录无效')
    await this.save(this.indexPath(), envelope, validIndex, JSON.stringify(envelope))
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
    const data = JSON.stringify(document)
    if (data.length > 40_000_000) throw new Error('笔记文档过大')
    await this.save(
      this.documentPath(id),
      document,
      (value): value is NoteDocument => validDocument(value, id),
      data
    )
  }
}
