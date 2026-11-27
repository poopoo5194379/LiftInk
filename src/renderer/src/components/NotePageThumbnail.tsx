import { useEffect, useState } from 'react'
import type { NoteRecord } from '../../../shared/editor'
import { pageSvg } from '../editor/export'

export default function NotePageThumbnail({ note }: { note: NoteRecord }): React.JSX.Element {
  const [preview, setPreview] = useState<{ url?: string; text?: string }>({})

  useEffect(() => {
    if (note.workspace) return
    let cancelled = false
    let url: string | undefined
    void window.liftInk.loadDocument(note.id).then(async ({ value }) => {
      const page = value?.pages[0]
      if (!page || cancelled) return
      if (value.richText) {
        const content: unknown = JSON.parse(value.richText)
        const lines: string[] = []
        const visit = (node: unknown): void => {
          if (!node || typeof node !== 'object' || lines.length >= 12) return
          if ('text' in node && typeof node.text === 'string') lines.push(node.text.slice(0, 120))
          if ('content' in node && Array.isArray(node.content)) node.content.forEach(visit)
        }
        visit(content)
        setPreview({ text: lines.join(' ') })
        return
      }
      const ids = new Set(page.elements.flatMap((element) => element.kind === 'image' ? [element.assetId] : []))
      if (page.backgroundAssetId) ids.add(page.backgroundAssetId)
      const entries = await Promise.all([...ids].map(async (id) => {
        const asset = await window.liftInk.loadImage(id).catch(() => null)
        return [id, asset?.dataUrl ?? ''] as const
      }))
      if (cancelled) return
      url = URL.createObjectURL(new Blob([pageSvg(page, Object.fromEntries(entries), true)], { type: 'image/svg+xml' }))
      setPreview({ url })
    }).catch(() => { if (!cancelled) setPreview({}) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [note.id, note.updatedAt, note.workspace])

  const text = note.workspace === 'voice' ? note.draft?.transcript : preview.text
  return <div className="thumb page-thumbnail">
    {preview.url ? <img src={preview.url} alt="第一页缩略图" draggable={false} /> :
      <div className="thumbnail-paper" aria-hidden="true">{text?.slice(0, 300)}</div>}
  </div>
}
