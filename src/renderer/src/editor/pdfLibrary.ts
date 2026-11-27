import { handwritingSignature } from './inkRecognition'
import { draftText, noteRecordings, richNodes } from '../../../shared/noteResources'
import type { NoteDocument, NoteRecord } from '../../../shared/editor'
import { indexPdf, normalizePdfText } from './pdfSearch'
import { plainCanvasText } from './canvasText'

export function matchesNoteSearch(parts: readonly string[], query: string): boolean {
  const term = normalizePdfText(query)
  return !term || parts.some((part) => normalizePdfText(part).includes(term))
}

export async function readNoteContent(note: NoteRecord, signal: AbortSignal): Promise<{ pdf: string[]; body: string[] }> {
  const { value } = note.workspace ? { value: null } : await window.liftInk.loadDocument(note.id)
  signal.throwIfAborted()
  const draft = note.draft
  const ink = await Promise.all(value?.pages.flatMap((page) => page.recognizedInk ? [
    handwritingSignature(page).then((signature) => signature === page.recognizedInk?.signature ? page.recognizedInk.text : '')
  ] : []) ?? [])
  const body = [
    ...ink,
    ...draftText(draft),
    ...noteRecordings(value).map((item) => item.transcript?.text ?? ''),
    ...(value?.pages.flatMap((page) => page.elements.flatMap((item) => item.kind === 'text' ? [plainCanvasText(item)] : [])) ?? []),
    ...(draft?.boardPage?.elements.flatMap((item) => item.kind === 'text' ? [plainCanvasText(item)] : []) ?? []),
    ...(value?.richText ? [richNodes(value.richText).flatMap((node) => typeof node.text === 'string' ? [node.text] : []).join(' ')] : [])
  ].filter(Boolean)
  return { pdf: value ? await readPages(value, signal) : [], body }
}

async function readPages(document: NoteDocument, signal: AbortSignal): Promise<string[]> {
  const nativeText = new Map<string, string[]>()
  const entries = document.pages.flatMap((page) => page.sourcePdfId && page.sourcePageNumber
    ? [{ id: page.sourcePdfId, number: page.sourcePageNumber }] : [])
  for (const id of new Set(entries.map((page) => page.id))) {
    signal.throwIfAborted()
    let text = await window.liftInk.loadNativePdfText(id).catch(() => null)
    if (!text) {
      try {
        text = (await indexPdf(id, signal)).map((page) => page.searchable.slice(0, 24_000))
        await window.liftInk.saveNativePdfText(id, text).catch(() => undefined)
      } catch { signal.throwIfAborted() }
    }
    if (text) nativeText.set(id, text)
  }
  signal.throwIfAborted()
  return (await Promise.all(entries.map(async ({ id, number }) => {
    const native = nativeText.get(id)?.[number - 1] ?? ''
    const scan = await window.liftInk.loadPdfOcr(id, number).catch(() => null)
    const ocr = normalizePdfText(scan?.text ?? '')
    return ocr && !native.includes(ocr) ? [native, ocr].filter(Boolean).join('\n') : native
  }))).filter(Boolean)
}

export type Keyword = { text: string; noteIds: string[]; count: number; sections: number; latest: number }
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
const stopWords = new Set(('一个 一种 这类 这些 那些 进行 可以 通过 以及 其中 对于 根据 如果 需要 由于 目前 比如 ' +
  '时候 是否 如何 没有 相关 不同 以上 以下 之后 之前 主要 内容 笔记 结果 文件 图表 问题 目前 ' +
  '就是 的是 我们 你们 他们 她们 它们 自己 包括 其实 觉得 认为 这样 那样 什么 怎么 这么 那么 ' +
  '因为 所以 但是 而且 虽然 不过 然后 同时 只是 不是 也是 还是 已经 仍然 一定 可能 应该 ' +
  '还有 这个 那个 这次 那次 这里 那里 有些 一些 这些 这么 更多 其他 之中 之间 关于 之一 ' +
  '的 是 和 与 中 为 在 未命名 the and for that with this from pdf ppt note have using').split(' '))

export function recentKeywords(notes: NoteRecord[], contents: ReadonlyMap<string, string[]>, since: number, blocked: readonly string[] = []): Keyword[] {
  const blockedWords = new Set(blocked)
  const words = new Map<string, Keyword>()
  for (const note of notes) {
    const latest = note.updatedAt ?? note.createdAt ?? 0
    if (note.trashed || latest < since) continue
    const counts = new Map<string, { count: number; sections: number }>()
    for (const part of [note.title, ...note.tags, ...(contents.get(note.id) ?? [])]) {
      const seen = new Set<string>()
      for (const { segment, isWordLike } of segmenter.segment(part.toLowerCase())) {
        if (!isWordLike || stopWords.has(segment) || blockedWords.has(segment) || !/^\p{Script=Han}{2,4}$/u.test(segment)) continue
        const entry = counts.get(segment) ?? { count: 0, sections: 0 }
        entry.count++
        if (!seen.has(segment)) entry.sections++
        counts.set(segment, entry)
        seen.add(segment)
      }
    }
    for (const [text, { count, sections }] of counts) {
      const entry = words.get(text) ?? { text, count: 0, sections: 0, noteIds: [], latest: 0 }
      entry.count += count
      entry.sections += sections
      entry.noteIds.push(note.id)
      entry.latest = Math.max(entry.latest, latest)
      words.set(text, entry)
    }
  }
  return [...words.values()].sort((a, b) => b.noteIds.length - a.noteIds.length || b.sections - a.sections || b.count - a.count || b.latest - a.latest || a.text.localeCompare(b.text, 'zh-CN')).slice(0, 12)
}
