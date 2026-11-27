import { Editor } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { MarkdownImage } from '../components/MarkdownImage'
import { emptyDocument } from './history'
import type { NoteDocument } from '../../../shared/editor'

export function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown)$/i.test(file.name)
}

export async function importMarkdown(file: File, id: string): Promise<NoteDocument> {
  if (file.size > 75_000_000) throw new Error('Markdown 文件超过 75 MB')
  let text = await file.text()
  const pattern = /^!\[([^\]\r\n]*)\]\(data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)\)\s*$/gim
  const replacements = new Map<string, string>()
  const images = [...text.matchAll(pattern)]
  if (images.length > 250) throw new Error('Markdown 图片过多')
  for (const [full, alt, mime, data] of images) {
    if (replacements.has(full)) continue
    const { assetId } = await window.liftInk.storeImage(mime.toLowerCase(), data)
    const label = alt.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    replacements.set(full, `\n<img data-liftink-image="${assetId}" alt="${label}">\n`)
  }
  text = text.replace(pattern, (match) => replacements.get(match) ?? match)
  if (text.length > 8_000_000) throw new Error('Markdown 正文过大')
  const editor = new Editor({
    element: null,
    extensions: [StarterKit.configure({ link: false }), TextStyle, Color, MarkdownImage, Markdown],
    content: text,
    contentType: 'markdown'
  })
  try { return { ...emptyDocument(id), richText: JSON.stringify(editor.getJSON()) } }
  finally { editor.destroy() }
}
