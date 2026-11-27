import { useEffect, useState } from 'react'
import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { GripVertical } from 'lucide-react'

const validAsset = /^[a-f0-9]{64}\.(png|jpg|webp)$/

function ImageView({ node, editor, selected, getPos }: NodeViewProps): React.JSX.Element {
  const assetId = String(node.attrs.assetId)
  const alt = String(node.attrs.alt || '笔记图片')
  const [image, setImage] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    if (!validAsset.test(assetId)) return
    let active = true
    void window.liftInk.loadImage(assetId).then(({ dataUrl }) => {
      if (active) setImage({ id: assetId, url: dataUrl })
    }).catch(() => undefined)
    return () => { active = false }
  }, [assetId])
  return <NodeViewWrapper as="figure" className={`markdown-image${selected ? ' selected' : ''}`} contentEditable={false}>
    <span className="markdown-image-handle" data-drag-handle aria-label="拖动图片" title="拖动图片"><GripVertical size={17} /></span>
    <button type="button" className="markdown-image-select" aria-label={`选择图片 ${alt}`} onClick={() => {
      const pos = getPos()
      if (typeof pos === 'number') editor.commands.setNodeSelection(pos)
    }}>
      {image?.id === assetId ? <img src={image.url} alt={alt} draggable={false} /> : <span>图片暂不可用</span>}
    </button>
  </NodeViewWrapper>
}

export const MarkdownImage = Node.create({
  name: 'liftInkImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() { return { assetId: { default: '', rendered: false }, alt: { default: '', rendered: false } } },
  parseHTML() {
    return [{ tag: 'img[data-liftink-image]', getAttrs: (element) => {
      const assetId = element.getAttribute('data-liftink-image') ?? ''
      return validAsset.test(assetId) ? { assetId, alt: element.getAttribute('alt') ?? '' } : false
    } }]
  },
  renderHTML({ node }) {
    return ['img', { 'data-liftink-image': node.attrs.assetId, alt: node.attrs.alt }]
  },
  renderMarkdown(node) {
    const assetId = String(node.attrs?.assetId ?? '')
    const alt = String(node.attrs?.alt || '笔记图片').replace(/[\\[\]\r\n]/g, ' ')
    return validAsset.test(assetId) ? `![${alt}](liftink-image:${assetId})` : ''
  },
  addNodeView() { return ReactNodeViewRenderer(ImageView) }
})

export async function resolveMarkdownImages(markup: string, format: 'md' | 'pdf'): Promise<string> {
  const pattern = format === 'md'
    ? /liftink-image:([a-f0-9]{64}\.(?:png|jpg|webp))/g
    : /data-liftink-image="([a-f0-9]{64}\.(?:png|jpg|webp))"/g
  const counts = new Map<string, number>()
  for (const [, id] of markup.matchAll(pattern)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const assets = new Map<string, string>()
  let bytes = 0
  for (const [id, count] of counts) {
    const { dataUrl } = await window.liftInk.loadImage(id)
    bytes += dataUrl.length * count
    if (bytes > 70_000_000) throw new Error('导出包含的图片太大，请缩小后重试')
    assets.set(id, dataUrl)
  }
  return markup.replace(pattern, (_match, id: string) => format === 'md' ? assets.get(id)! : `src="${assets.get(id)}"`)
}
