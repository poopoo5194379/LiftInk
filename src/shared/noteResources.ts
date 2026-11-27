import type { AudioTranscript, NoteDocument, NoteRecord, Recording } from './editor'

export function noteRecordings(value: { recordings?: Recording[]; audioAssetId?: string; audioStartedAt?: number; audioTranscript?: AudioTranscript } | null | undefined): Recording[] {
  if (!value) return []
  return value.recordings ?? (value.audioAssetId ? [{ id: 'legacy', assetId: value.audioAssetId, startedAt: value.audioStartedAt ?? 0, transcript: value.audioTranscript }] : [])
}

export function richNodes(richText: string | undefined): { type?: string; text?: string; attrs?: Record<string, unknown> }[] {
  if (!richText) return []
  const root: unknown = JSON.parse(richText)
  const nodes: ReturnType<typeof richNodes> = []
  const pending: unknown[] = [root]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    nodes.push(value)
    if ('content' in value && Array.isArray(value.content)) {
      for (let i = value.content.length - 1; i >= 0; i--) pending.push(value.content[i])
    }
  }
  return nodes
}

export function draftText(draft?: NoteRecord['draft']): string[] {
  if (!draft) return []
  return [draft.transcript, ...(draft.mindMap?.map((node) => node.label) ?? draft.nodes), ...draft.boardItems,
    ...noteRecordings(draft).map((item) => item.transcript?.text ?? '')].filter(Boolean)
}

export function referencedAssets(document?: NoteDocument | null, record?: NoteRecord | null): string[] {
  const draft = record?.draft
  const pages = [...(document?.pages ?? []), ...(draft?.boardPage ? [draft.boardPage] : [])]
  const ids = [document?.sourcePdfId, ...(document?.sourcePdfIds ?? []),
    ...noteRecordings(document ?? {}).map((item) => item.assetId),
    ...noteRecordings(draft ?? {}).map((item) => item.assetId),
    ...pages.flatMap((page) => [page.sourcePdfId, page.backgroundAssetId, ...page.elements.flatMap((element) => element.kind === 'image' ? [element.assetId] : [])]),
    ...richNodes(document?.richText).flatMap((node) => node.type === 'liftInkImage' && typeof node.attrs?.assetId === 'string' ? [node.attrs.assetId] : [])]
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}
