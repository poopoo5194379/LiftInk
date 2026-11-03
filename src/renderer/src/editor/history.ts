import type { NoteDocument, NotePage, PageElement, PaperKind } from '../../../shared/editor'

type ElementChange = {
  kind: 'element'
  pageId: string
  index: number
  before: PageElement | null
  after: PageElement | null
}
type PageChange = { kind: 'page'; index: number; before: NotePage | null; after: NotePage | null }
type PaperChange = { kind: 'paper'; pageId: string; before: PaperKind; after: PaperKind }
type Change = ElementChange | PageChange | PaperChange

function apply(document: NoteDocument, changes: Change[], forward: boolean): NoteDocument {
  const pages = document.pages.map((page) => ({ ...page, elements: [...page.elements] }))
  for (const change of forward ? changes : [...changes].reverse()) {
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
      page.paper = forward ? change.after : change.before
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
    this.current = document
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }
  private commit(changes: Change[]): NoteDocument {
    if (changes.length === 0) return this.current
    this.current = apply(this.current, changes, true)
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
    return this.commit(changes)
  }
  addPage(page: NotePage): NoteDocument {
    return this.commit([
      { kind: 'page', index: this.current.pages.length, before: null, after: page }
    ])
  }
  setPaper(pageId: string, paper: PaperKind): NoteDocument {
    const current = this.current.pages.find((page) => page.id === pageId)
    return current && current.paper !== paper
      ? this.commit([{ kind: 'paper', pageId, before: current.paper, after: paper }])
      : this.current
  }
  undo(): NoteDocument {
    const changes = this.undoStack.pop()
    if (changes) {
      this.current = apply(this.current, changes, false)
      this.redoStack.push(changes)
    }
    return this.current
  }
  redo(): NoteDocument {
    const changes = this.redoStack.pop()
    if (changes) {
      this.current = apply(this.current, changes, true)
      this.undoStack.push(changes)
    }
    return this.current
  }
}

export function emptyDocument(noteId: string): NoteDocument {
  return { version: 1, noteId, pages: [{ id: crypto.randomUUID(), paper: 'lines', elements: [] }] }
}
