import type { NoteDocument, NotePage, PageElement, PaperKind, PaperSpacing } from '../../../shared/editor'
import { MAX_NOTE_PAGES } from '../../../shared/editor'

function nextWritingPage(document: NoteDocument): NotePage | undefined {
  const last = document.pages.at(-1)
  if (!last?.elements.length || document.pages.length >= MAX_NOTE_PAGES) return
  return { id: crypto.randomUUID(), paper: last.paper, paperColor: last.paperColor, paperSpacing: last.paperSpacing, size: last.size, elements: [], autoContinuation: true }
}

export function isUnusedContinuation(page: NotePage): boolean {
  return page.autoContinuation === true && !page.elements.length && !page.sourcePdfId &&
    !page.backgroundAssetId && !page.bookmark && !page.layers?.length
}

type ElementChange = {
  kind: 'element'
  pageId: string
  index: number
  before: PageElement | null
  after: PageElement | null
}
type PageChange = { kind: 'page'; index: number; before: NotePage | null; after: NotePage | null }
type PaperStyle = Pick<NotePage, 'paper' | 'paperSpacing'>
type PaperChange = { kind: 'paper'; pageId: string; before: PaperStyle; after: PaperStyle }
type SnapshotChange = { kind: 'snapshot'; before: NoteDocument; after: NoteDocument }
type Change = ElementChange | PageChange | PaperChange | SnapshotChange

function apply(document: NoteDocument, changes: Change[], forward: boolean): NoteDocument {
  const pages = document.pages.map((page) => ({ ...page, elements: [...page.elements] }))
  for (const change of forward ? changes : [...changes].reverse()) {
    if (change.kind === 'snapshot') return forward ? change.after : change.before
    if (change.kind === 'page') {
      const value = forward ? change.after : change.before
      const other = forward ? change.before : change.after
      if (other) {
        const index = pages.findIndex((page) => page.id === other.id)
        if (index >= 0) pages.splice(index, 1)
      }
      if (value) pages.splice(change.index, 0, { ...value, elements: [...value.elements] })
      continue
    }
    const page = pages.find((entry) => entry.id === change.pageId)
    if (!page) continue
    if (change.kind === 'paper') {
      Object.assign(page, forward ? change.after : change.before)
      continue
    }
    const value = forward ? change.after : change.before
    const other = forward ? change.before : change.after
    if (other) {
      const index = page.elements.findIndex((element) => element.id === other.id)
      if (index >= 0) page.elements.splice(index, 1)
    }
    if (value) page.elements.splice(Math.min(change.index, page.elements.length), 0, value)
  }
  return { ...document, pages }
}

export class DocumentHistory {
  current: NoteDocument
  private undoStack: Change[][] = []
  private redoStack: Change[][] = []

  constructor(document: NoteDocument) {
    const next = nextWritingPage(document)
    this.current = next ? { ...document, pages: [...document.pages, next] } : document
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  private commit(changes: Change[], continueWriting = false): NoteDocument {
    if (changes.length === 0) return this.current
    let next = apply(this.current, changes, true)
    const blank = continueWriting ? nextWritingPage(next) : undefined
    if (blank) {
      changes.push({ kind: 'page', index: next.pages.length, before: null, after: blank })
      next = { ...next, pages: [...next.pages, blank] }
    }
    this.current = { ...next, revision: (this.current.revision ?? 0) + 1 }
    this.undoStack.push(changes)
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    return this.current
  }
  changeElements(
    pageId: string,
    updates: { id: string; after: PageElement | null }[]
  ): NoteDocument {
    const page = this.current.pages.find((entry) => entry.id === pageId)
    if (!page) return this.current
    let added = 0
    const changes: ElementChange[] = updates.flatMap(({ id, after }) => {
      const index = page.elements.findIndex((entry) => entry.id === id)
      const before = index >= 0 ? page.elements[index] : null
      if (!before && !after) return []
      return [
        {
          kind: 'element' as const,
          pageId,
          index: index >= 0 ? index : page.elements.length + added++,
          before,
          after
        }
      ]
    })
    return this.commit(changes, changes.some((change) => change.after && this.current.pages.at(-1)?.id === change.pageId))
  }
  transferObjects(from: NotePage, to: NotePage, objects: PageElement[]): NoteDocument {
    if (!objects.length || from.id === to.id) return this.current
    const ids = new Set(objects.map(({ id }) => id))
    const removes = from.elements.flatMap<ElementChange>((before, index) =>
      ids.has(before.id) ? [{ kind: 'element', pageId: from.id, index, before, after: null }] : []).reverse()
    if (removes.length !== objects.length) return this.current
    const adds = objects.map<ElementChange>((after, index) =>
      ({ kind: 'element', pageId: to.id, index: to.elements.length + index, before: null, after }))
    return this.commit([...removes, ...adds], to.id === this.current.pages.at(-1)?.id)
  }
  addPage(page: NotePage): NoteDocument {
    return this.commit([
      { kind: 'page', index: this.current.pages.length, before: null, after: page }
    ])
  }
  replace(next: NoteDocument): NoteDocument {
    return this.commit([{ kind: 'snapshot', before: this.current, after: next }])
  }
  movePage(pageId: string, direction: -1 | 1): NoteDocument {
    const index = this.current.pages.findIndex((page) => page.id === pageId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= this.current.pages.length) return this.current
    const pages = [...this.current.pages]
    ;[pages[index], pages[target]] = [pages[target], pages[index]]
    return this.replace({ ...this.current, pages })
  }
  removePage(pageId: string): NoteDocument {
    if (this.current.pages.length <= 1) return this.current
    return this.replace({ ...this.current, pages: this.current.pages.filter((page) => page.id !== pageId) })
  }
  updatePage(pageId: string, patch: Partial<NotePage>): NoteDocument {
    return this.replace({ ...this.current, pages: this.current.pages.map((page) => page.id === pageId ? { ...page, ...patch } : page) })
  }
  setPaper(pageId: string, paper: PaperKind, spacing?: PaperSpacing): NoteDocument {
    const current = this.current.pages.find((page) => page.id === pageId)
    if (!current) return this.current
    const paperSpacing = spacing ?? current.paperSpacing
    if (current.paper === paper && current.paperSpacing === paperSpacing) return this.current
    return this.commit([{
      kind: 'paper',
      pageId,
      before: { paper: current.paper, paperSpacing: current.paperSpacing },
      after: { paper, paperSpacing }
    }])
  }
  undo(): NoteDocument {
    const changes = this.undoStack.pop()
    if (changes) {
      this.current = { ...apply(this.current, changes, false), revision: (this.current.revision ?? 0) + 1 }
      this.redoStack.push(changes)
    }
    return this.current
  }
  redo(): NoteDocument {
    const changes = this.redoStack.pop()
    if (changes) {
      this.current = { ...apply(this.current, changes, true), revision: (this.current.revision ?? 0) + 1 }
      this.undoStack.push(changes)
    }
    return this.current
  }
}

export function emptyDocument(noteId: string): NoteDocument {
  return { version: 1, noteId, revision: 0, pages: [{ id: crypto.randomUUID(), paper: 'lines', elements: [] }] }
}
