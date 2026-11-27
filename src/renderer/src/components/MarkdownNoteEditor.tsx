import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import type { JSONContent } from '@tiptap/core'
import { NodeSelection, type Transaction } from '@tiptap/pm/state'
import { ArrowDown, ArrowUp, Bold, ChevronLeft, Crop, FileDown, FileText, Heading, ImagePlus, Italic, List, ListOrdered, Palette, Quote, Save, Scan } from 'lucide-react'
import type { CapturedScreen, NoteDocument, NoteRecord, StoredImage } from '../../../shared/editor'
import { useNoteFocus, type FocusReporter } from '../editor/useNoteFocus'
import { createEditorAutosave } from '../editor/autosave'
import { emptyDocument } from '../editor/history'
import { clipboardImages, imageAccept, storeImageFile } from '../editor/imageAsset'
import FolderPicker from './FolderPicker'
import NoteTagPicker from './NoteTagPicker'
import CaptureDialog from './CaptureDialog'
import { EditorButton, ToolPopover } from './EditorControls'
import { MarkdownImage, resolveMarkdownImages } from './MarkdownImage'

const MarkdownTextStyle = TextStyle.extend({
  renderMarkdown(node, helpers) {
    const text = helpers.renderChildren(node)
    const color: unknown = node.attrs?.color
    return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)
      ? `<span style="color:${color}">${text}</span>` : text
  }
})
const colors = [
  ['默认', '#252638'], ['炭灰', '#515462'], ['石板灰', '#65758a'], ['米灰', '#857467'],
  ['红色', '#bf354a'], ['橙色', '#b45129'], ['金色', '#916514'], ['橄榄绿', '#647627'],
  ['绿色', '#26704f'], ['青色', '#16767e'], ['蓝色', '#2966b6'], ['靛蓝', '#4a57a8'],
  ['紫色', '#7351a7'], ['梅紫', '#934782'], ['玫粉', '#aa476b'], ['棕色', '#875340']
] as const

type Props = {
  note: NoteRecord
  folders: string[]
  onBack: () => void
  onTitleChange: (title: string) => void
  onFolderChange: (folder: string) => void
  tagCatalog?: string[]
  onTagsChange?: (tags: string[]) => void
  onCreateTag?: (tag: string) => void
  saveDraft?: (document: NoteDocument) => Promise<void>
  onFocusTime?: FocusReporter
  active?: boolean
  onActivate?: () => void
  onDocumentSaved: (id: string, timestamp: number, pages: number) => void
}

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

export default function MarkdownNoteEditor({
  note, folders, onBack, onTitleChange, onFolderChange, tagCatalog = [], onTagsChange, onCreateTag, saveDraft, onDocumentSaved, onFocusTime, active = true, onActivate
}: Props): React.JSX.Element {
  useNoteFocus(note, active, onFocusTime)
  const [status, setStatus] = useState('正在打开…')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [popover, setPopover] = useState<{ kind: 'heading' | 'color'; anchor: HTMLButtonElement } | null>(null)
  const [capture, setCapture] = useState<Pick<CapturedScreen, 'dataUrl' | 'label'> | null>(null)
  const [crop, setCrop] = useState<{ from: number; assetId: string; alt: string; url: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingPaste = useRef<Promise<void>>(Promise.resolve())
  const [autosave] = useState(() => createEditorAutosave(() => false))
  const latest = useRef<NoteDocument | null>(null)
  const saved = useRef(false)

  const write = async (snapshot: NoteDocument): Promise<void> => {
    setStatus('保存中…')
    try {
      if (saveDraft && !saved.current) await saveDraft(snapshot)
      else await window.liftInk.saveDocument(snapshot)
      saved.current = true
      onDocumentSaved(note.id, Date.now(), 1)
      if (latest.current === snapshot) setStatus('已保存')
    } catch (error) {
      setStatus(`保存失败：${String(error)}`)
      throw error
    }
  }
  const queue = (content: JSONContent): void => {
    if (!latest.current) return
    const next = {
      ...latest.current,
      richText: JSON.stringify(content),
      revision: (latest.current.revision ?? 0) + 1
    }
    latest.current = next
    setStatus('待自动保存')
    autosave.stage(() => write(next))
  }
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), MarkdownTextStyle, Color, MarkdownImage, Markdown],
    editable: false,
    editorProps: { attributes: { 'aria-label': 'Markdown 正文', 'aria-multiline': 'true', role: 'textbox' } },
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => queue(editor.getJSON())
  })

  const isDraft = useEffectEvent(() => Boolean(saveDraft))
  useEffect(() => {
    if (!editor) return
    let cancelled = false
    const draft = isDraft()
    const open = draft ? Promise.resolve(emptyDocument(note.id)) : window.liftInk.loadDocument(note.id).then(({ value }) => value)
    void open.then((value) => {
      if (cancelled) return
      if (!value) throw new Error('Markdown 文档缺失')
      latest.current = value
      saved.current = !draft
      if (value.richText) editor.commands.setContent(JSON.parse(value.richText), { emitUpdate: false, errorOnInvalidContent: true })
      editor.setEditable(true, false)
      setReady(true)
      setStatus(draft ? '未保存草稿' : '已保存')
    }).catch((error) => { if (!cancelled) setStatus(`打开失败：${String(error)}`) })
    return () => { cancelled = true }
  }, [editor, note.id])
  useEffect(() => () => { void autosave.flush().catch(() => undefined) }, [autosave])

  const saveNow = (): void => {
    if (!editor || !latest.current || !ready) return
    void pendingPaste.current.then(() => {
      if (editor.isDestroyed) return
      if (!saved.current || !latest.current?.richText) queue(editor.getJSON())
      return autosave.flush()
    }).catch(() => undefined)
  }
  const exportMarkdown = async (format: 'md' | 'pdf'): Promise<void> => {
    if (!editor || busy) return
    setBusy(true)
    const title = note.title.trim() || '未命名笔记'
    try {
      const content = await resolveMarkdownImages(format === 'md' ? editor.getMarkdown() : editor.getHTML(), format)
      const path = format === 'pdf' ? await window.liftInk.exportMarkdownPdf(title, content)
        : await window.liftInk.saveExport('md', title, encode(`# ${title.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>])/g, '\\$1')}\n\n${content}\n`))
      if (path) setStatus(format === 'md' ? '已导出 Markdown' : '已导出 PDF')
    } catch (error) { setStatus(`导出失败：${String(error)}`) }
    finally { setBusy(false) }
  }
  const selection = editor?.state.selection
  const selectedImage = selection instanceof NodeSelection && selection.node.type.name === 'liftInkImage' ? selection : null
  const insertImage = (asset: StoredImage, alt: string): void => {
    if (!editor) return
    editor.chain().focus().insertContentAt(editor.state.selection.to, {
      type: 'liftInkImage', attrs: { assetId: asset.assetId, alt }
    }).run()
  }
  const addFile = async (file: File): Promise<void> => {
    setBusy(true)
    try { insertImage(await storeImageFile(file), file.name) }
    catch (error) { setStatus(`图片插入失败：${String(error)}`) }
    finally { setBusy(false) }
  }
  const pasteImages = (event: React.ClipboardEvent): void => {
    if (!editor || !ready) return
    const files = clipboardImages(event.clipboardData)
    if (!files.length) return
    event.preventDefault()
    event.stopPropagation()
    let bookmark = editor.state.selection.getBookmark()
    const track = ({ transaction }: { transaction: Transaction }): void => { bookmark = bookmark.map(transaction.mapping) }
    editor.on('transaction', track)
    const paste = async (): Promise<void> => {
      try {
        const results = await Promise.allSettled(files.slice(0, 10).map(async (file) => ({
          type: 'liftInkImage', attrs: { assetId: (await storeImageFile(file)).assetId, alt: file.name || '粘贴图片' }
        })))
        if (editor.isDestroyed) return
        const images = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
        const selection = bookmark.resolve(editor.state.doc)
        if (images.length && !editor.commands.insertContentAt({ from: selection.from, to: selection.to }, images,
          { updateSelection: editor.state.selection.eq(selection) })) throw new Error('无法在光标处插入图片')
        if (images.length !== files.length) setStatus(`已粘贴 ${images.length} 张图片，${files.length - images.length} 张未导入（支持不超过 20 MB 的 PNG、JPG、WebP，单次最多 10 张）`)
      } catch (error) { if (!editor.isDestroyed) setStatus(`图片粘贴失败：${String(error)}`) }
      finally { editor.off('transaction', track) }
    }
    pendingPaste.current = pendingPaste.current.then(paste)
  }
  const beginCapture = async (): Promise<void> => {
    setBusy(true)
    try { setCapture(await window.liftInk.captureScreen()) }
    catch (error) { setStatus(`截图失败：${String(error)}`) }
    finally { setBusy(false) }
  }
  const beginCrop = async (): Promise<void> => {
    if (!selectedImage) return
    const { from, node } = selectedImage
    const assetId = String(node.attrs.assetId)
    setBusy(true)
    try { setCrop({ from, assetId, alt: String(node.attrs.alt), url: (await window.liftInk.loadImage(assetId)).dataUrl }) }
    catch (error) { setStatus(`裁剪失败：${String(error)}`) }
    finally { setBusy(false) }
  }
  const applyCrop = async (_mode: 'note' | 'pin', dataUrl: string): Promise<void> => {
    if (!editor || !crop) return
    const asset = await window.liftInk.storeImage('image/png', dataUrl.split(',')[1])
    const current = editor.state.doc.nodeAt(crop.from)
    if (current?.type.name !== 'liftInkImage' || current.attrs.assetId !== crop.assetId) throw new Error('图片位置已变化，请重新选择')
    editor.view.dispatch(editor.state.tr.setNodeMarkup(crop.from, undefined, { assetId: asset.assetId, alt: crop.alt }))
    setCrop(null)
  }
  const moveImage = (direction: -1 | 1): void => {
    if (!editor || !selectedImage) return
    const { $from, from, to, node } = selectedImage
    const index = $from.index(0)
    const doc = editor.state.doc
    if ($from.depth !== 0 || index + direction < 0 || index + direction >= doc.childCount) return
    const neighbor = doc.child(index + direction)
    const insertAt = from + direction * neighbor.nodeSize
    const transaction = editor.state.tr.delete(from, to).insert(insertAt, node)
    editor.view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, insertAt)).scrollIntoView())
    editor.commands.focus()
  }
  const formatting = editor ? [
    { label: '加粗', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: '斜体', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: '无序列表', icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: '编号列表', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: '引用', icon: Quote, active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() }
  ] : []
  const preserveSelection = (event: React.MouseEvent): void => event.preventDefault()

  return (
    <section className="editor-view markdown-editor" onPointerDownCapture={onActivate} onFocusCapture={onActivate} aria-label="Markdown 笔记页面"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          saveNow()
        }
      }}
    >
      <header className="editor-topbar">
        <button className="editor-back" aria-label="返回上一页" onClick={() => {
          void pendingPaste.current.then(() => autosave.flush()).then(onBack).catch(() => undefined)
        }}><ChevronLeft size={20} />返回</button>
        <div className="editor-document">
          <FolderPicker value={note.folder} folders={folders} onChange={onFolderChange} />
          {onTagsChange && onCreateTag && <NoteTagPicker tags={note.tags} catalog={tagCatalog} onChange={onTagsChange} onCreate={onCreateTag} />}
        </div>
        <div className="editor-top-actions">
          <span role="status">{status}</span>
          <EditorButton aria-label="保存" help="保存当前笔记（Ctrl+S）。" disabled={!ready} onClick={saveNow}><Save size={18} /></EditorButton>
          <EditorButton aria-label="导出 Markdown" help="导出含图片的 Markdown 文件。" disabled={!ready || busy} onClick={() => void exportMarkdown('md')}><FileText size={18} /></EditorButton>
          <EditorButton aria-label="导出 PDF" help="导出可选中文字的 A4 PDF。" disabled={!ready || busy} onClick={() => void exportMarkdown('pdf')}><FileDown size={18} /></EditorButton>
        </div>
      </header>
      {editor && <div className="markdown-toolbar" role="toolbar" aria-label="Markdown 格式工具">
        <EditorButton aria-label="标题样式" help="选择正文或 H1–H6 标题。" disabled={!ready} aria-haspopup="dialog" aria-expanded={popover?.kind === 'heading'}
          onMouseDown={preserveSelection} onClick={(event) => setPopover(popover?.kind === 'heading' ? null : { kind: 'heading', anchor: event.currentTarget })}><Heading size={19} /></EditorButton>
        {formatting.map(({ label, icon: Icon, active, run }) => <EditorButton key={label} aria-label={label} help={`将此格式应用到所选内容。`} aria-pressed={active} disabled={!ready}
          onMouseDown={preserveSelection} onClick={run}><Icon size={18} /></EditorButton>)}
        <span className="markdown-toolbar-divider" />
        <EditorButton aria-label="文字颜色" help="打开色板或选取自定义颜色。" disabled={!ready} aria-haspopup="dialog" aria-expanded={popover?.kind === 'color'}
          onMouseDown={preserveSelection} onClick={(event) => setPopover(popover?.kind === 'color' ? null : { kind: 'color', anchor: event.currentTarget })}><Palette size={18} /></EditorButton>
        <span className="markdown-toolbar-divider" />
        <input type="file" accept={imageAccept} ref={fileInput} hidden onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void addFile(file)
        }} />
        <EditorButton aria-label="插入图片" help="选择本机图片，插入到光标处。" disabled={!ready || busy} onMouseDown={preserveSelection} onClick={() => fileInput.current?.click()}><ImagePlus size={18} /></EditorButton>
        <EditorButton aria-label="区域截图" help="框选屏幕区域，插入到当前笔记。" disabled={!ready || busy} onMouseDown={preserveSelection} onClick={() => void beginCapture()}><Scan size={18} /></EditorButton>
        <EditorButton aria-label="裁剪图片" help="选中一张图片，再框出要保留的部分。" disabled={!selectedImage || busy} onMouseDown={preserveSelection} onClick={() => void beginCrop()}><Crop size={18} /></EditorButton>
        <EditorButton aria-label="上移图片" help="把选中图片移到上一段前。" disabled={!selectedImage || selectedImage.$from.depth !== 0 || selectedImage.$from.index(0) === 0}
          onMouseDown={preserveSelection} onClick={() => moveImage(-1)}><ArrowUp size={18} /></EditorButton>
        <EditorButton aria-label="下移图片" help="把选中图片移到下一段后。" disabled={!selectedImage || selectedImage.$from.depth !== 0 || selectedImage.$from.index(0) >= editor.state.doc.childCount - 1}
          onMouseDown={preserveSelection} onClick={() => moveImage(1)}><ArrowDown size={18} /></EditorButton>
      </div>}
      <div className="markdown-scroll">
        <article className="markdown-paper">
          <h1 className="markdown-title"><input aria-label="笔记标题" value={note.title} onChange={(event) => onTitleChange(event.target.value)} /></h1>
          <EditorContent editor={editor} onPasteCapture={pasteImages} />
        </article>
      </div>
      {editor && popover && <ToolPopover anchor={popover.anchor} label={popover.kind === 'heading' ? '标题样式' : '文字颜色'} onClose={() => setPopover(null)}>
        {popover.kind === 'heading' ? <div className="markdown-heading-options">
          <button onMouseDown={preserveSelection} onClick={() => { editor.chain().focus().setParagraph().run(); setPopover(null) }}>正文</button>
          {([1, 2, 3, 4, 5, 6] as const).map((level) => <button key={level} aria-pressed={editor.isActive('heading', { level })}
            onMouseDown={preserveSelection} onClick={() => { editor.chain().focus().setHeading({ level }).run(); setPopover(null) }}>H{level}</button>)}
        </div> : <>
          <div className="editor-color-options">{colors.map(([label, color]) => <button key={color} aria-label={label} title={label}
            onMouseDown={preserveSelection} onClick={() => {
              if (label === '默认') editor.chain().focus().unsetColor().run()
              else editor.chain().focus().setColor(color).run()
              setPopover(null)
            }}><span style={{ background: color }} /></button>)}</div>
          <label className="markdown-custom-color">自定义颜色 <input aria-label="自定义文字颜色" type="color" defaultValue={editor.getAttributes('textStyle').color || '#252638'}
            onChange={(event) => editor.chain().setColor(event.currentTarget.value).run()} /></label>
        </>}
      </ToolPopover>}
      {capture && <CaptureDialog screen={capture} onClose={() => setCapture(null)} onResult={async (mode, dataUrl) => {
        const asset = await window.liftInk.storeImage('image/png', dataUrl.split(',')[1])
        if (mode === 'pin') await window.liftInk.pinImage(asset.assetId)
        else insertImage(asset, '区域截图')
        setCapture(null)
      }} />}
      {crop && <CaptureDialog purpose="crop" screen={{ dataUrl: crop.url, label: crop.alt }} onClose={() => setCrop(null)} onResult={applyCrop} />}
    </section>
  )
}
