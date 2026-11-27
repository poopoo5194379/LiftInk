import { useEffect, useRef, useState } from 'react'
import { flushVaultSettings, getVaultSetting, setVaultSetting } from '../editor/vaultSettings'
import { base64Of } from '../editor/portable'
import { ChevronLeft, Download, FileImage, FileText, Plus, SquarePen } from 'lucide-react'
import type { MindMapNode, NoteRecord } from '../../../shared/editor'
import { useNoteFocus, type FocusReporter } from '../editor/useNoteFocus'
import { imageAccept } from '../editor/imageAsset'
import MindMapEditor from './MindMapEditor'

export type QuickKind = 'voice' | 'import' | 'mindmap' | 'whiteboard'
export type QuickDraft = NonNullable<NoteRecord['draft']>

export default function QuickWorkspaceView({
  kind,
  initialNote,
  onBack,
  onSave,
  importBusy,
  onImport,
  onFocusTime,
  active = true,
  onActivate
}: {
  kind: QuickKind
  initialNote?: Pick<NoteRecord, 'id' | 'title' | 'draft' | 'focusByDay'>
  onBack: () => void
  onSave: (
    title: string,
    kind: 'voice' | 'map' | 'board',
    summary: string,
    draft: QuickDraft
  ) => Promise<void>
  onFocusTime?: FocusReporter
  active?: boolean
  onActivate?: () => void
  importBusy: boolean
  onImport: (files: File[]) => void
}): React.JSX.Element {
  useNoteFocus(initialNote, active, onFocusTime)
  const draftKey = `liftink:quick-draft:${kind}:${initialNote?.id ?? 'new'}`
  const [snapshot, setSnapshot] = useState(() => {
    const fallback = {
      title: initialNote?.title ?? (kind === 'voice' ? '语音速记' : kind === 'mindmap' ? '未命名思维导图' : '未命名白板'),
      draft: initialNote?.draft ?? { transcript: '', nodes: [], boardItems: [] } as QuickDraft
    }
    try { return JSON.parse(getVaultSetting(draftKey) ?? 'null') as typeof fallback | null ?? fallback }
    catch { return fallback }
  })
  const latest = useRef(snapshot)
  useEffect(() => {
    const refresh = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== draftKey) return
      try {
        const recovered = JSON.parse(getVaultSetting(draftKey) ?? 'null')
        if (recovered) { latest.current = recovered; setSnapshot(recovered) }
      } catch { /* keep the visible draft */ }
    }
    window.addEventListener('liftink-quick-draft', refresh)
    return () => window.removeEventListener('liftink-quick-draft', refresh)
  }, [draftKey])
  const [draftError, setDraftError] = useState('')
  const update = (change: (current: typeof snapshot) => typeof snapshot): void => {
    let previous = latest.current
    try { previous = JSON.parse(getVaultSetting(draftKey) ?? 'null') ?? previous }
    catch { /* retain the in-memory copy */ }
    const next = change(previous)
    latest.current = next
    try {
      setVaultSetting(draftKey, JSON.stringify(next))
      window.dispatchEvent(new CustomEvent('liftink-quick-draft', { detail: draftKey }))
      setDraftError('')
    } catch { setDraftError('本地草稿写入失败，请直接保存到笔记库') }
    setSnapshot(next)
  }
  const updateDraft = (patch: Partial<QuickDraft>): void =>
    update((current) => ({ ...current, draft: { ...current.draft, ...patch } }))
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const [root = '中心主题', ...branches] = snapshot.draft.nodes ?? []
  const mindMap: MindMapNode[] = snapshot.draft.mindMap?.length ? snapshot.draft.mindMap :
    [{ id: 'root', label: root }, ...branches.map((label, index) => ({ id: `branch-${index}`, label, parentId: 'root' }))]
  const boardItems = snapshot.draft.boardItems ?? []
  const save = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    try {
      const { title, draft } = latest.current
      const summary = kind === 'voice'
        ? draft.transcript.trim().slice(0, 400) || '语音速记'
        : (kind === 'mindmap' ? mindMap.map((node) => node.label) : boardItems).join(' · ').slice(0, 400)
      await onSave(title.trim() || label, kind === 'mindmap' ? 'map' : kind === 'whiteboard' ? 'board' : 'voice', summary, draft)
      setVaultSetting(draftKey, null)
      await flushVaultSettings()
    } catch (error) { setDraftError(`保存失败：${String(error)}`) }
    finally { setSaving(false) }
  }
  const exportContent = async (): Promise<void> => {
    setExporting(true)
    setExportStatus('')
    try {
      const title = latest.current.title.trim() || label
      const byParent = new Map<string | undefined, MindMapNode[]>()
      for (const node of mindMap) byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node])
      const visited = new Set<string>()
      const lines: string[] = []
      const walk = (parent: string | undefined, depth: number): void => {
        for (const node of byParent.get(parent) ?? []) {
          if (visited.has(node.id) || depth > 50) continue
          visited.add(node.id)
          lines.push(`${'  '.repeat(depth)}- ${node.label.replace(/\s+/g, ' ').trim()}`)
          walk(node.id, depth + 1)
        }
      }
      walk(undefined, 0)
      const bytes = new TextEncoder().encode(`# ${title}\n\n${lines.join('\n')}\n`)
      const path = await window.liftInk.saveExport('md', title, base64Of(bytes))
      if (path) setExportStatus('已导出')
    } catch (error) { setExportStatus(`导出失败：${String(error)}`) }
    finally { setExporting(false) }
  }
  const label =
    kind === 'voice'
      ? '旧版语音速记'
      : kind === 'import'
        ? '导入文件'
        : kind === 'mindmap'
          ? '思维导图'
          : '白板'
  return (
    <section className="quick-workspace" onPointerDownCapture={onActivate} onFocusCapture={onActivate} aria-label={`${label}页面`}>
      <header className="quick-workspace-bar">
        <button className="back-link" onClick={onBack}>
          <ChevronLeft size={18} /> 返回
        </button>
        <span>{kind === 'import' ? '导入本机文件' : '本地工作区'}</span>
      </header>
      {kind === 'import' ? (
        <div className="import-workspace">
          <FileImage size={36} />
          <h1>导入 PDF、图片或 Markdown</h1>
          <p>每个文件会存成一篇可编辑的笔记，默认放入未分类。</p>
          <input ref={importInput} type="file" accept={`.pdf,application/pdf,.md,.markdown,${imageAccept}`} multiple hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? [])
              event.currentTarget.value = ''
              if (files.length) onImport(files)
            }} />
          <button className="recent-create" onClick={() => importInput.current?.click()} disabled={importBusy}>
            {importBusy ? '正在导入…' : '选择文件'}
          </button>
          <small>支持 PDF、Markdown、PNG、JPG、WebP · 单次最多 10 个</small>
        </div>
      ) : (
        <>
          <div className="quick-workspace-heading">
            <div>
              <span>{label}</span>
              <input
                aria-label="内容标题"
                value={snapshot.title}
                onChange={(event) => {
                  const title = event.target.value
                  update((current) => ({ ...current, title }))
                }}
              />
            </div>
            <div className="recent-heading-actions">
            {kind === 'mindmap' && <button className="recent-create recent-create-secondary"
              disabled={exporting} onClick={() => void exportContent()}>
              <Download size={15} /> 导出 Markdown 大纲
            </button>}
            <button
              className="recent-create"
              disabled={saving}
              onClick={() => void save()}
            >
              {initialNote ? '保存修改' : '保存到未分类'}
            </button>
            </div>
          </div>
          {kind === 'voice' ? (
            <div className="voice-workspace">
              <label className="voice-transcript">
                速记文字
                <textarea
                  aria-label="速记文字"
                  placeholder="在这里整理刚刚想到的内容…"
                  value={snapshot.draft.transcript}
                  onChange={(event) => updateDraft({ transcript: event.target.value })}
                />
              </label>
            </div>
          ) : kind === 'mindmap' ? (
            <MindMapEditor nodes={mindMap} onChange={(nodes) => updateDraft({ mindMap: nodes, nodes: nodes.map((node) => node.label) })} />
          ) : (
            <div className="whiteboard-workspace">
              <div className="canvas-actions">
                <span>文字白板</span>
                <button onClick={() => updateDraft({ boardItems: [...boardItems, '新的想法'] })}>
                  <Plus size={16} /> 添加文字块
                </button>
              </div>
              <div className="whiteboard-canvas">
                {boardItems.map((item, index) => (
                  <textarea
                    key={index}
                    aria-label={`文字块 ${index + 1}`}
                    value={item}
                    onChange={(event) =>
                      updateDraft({ boardItems: boardItems.map((value, itemIndex) => itemIndex === index ? event.target.value : value) })
                    }
                  />
                ))}
              </div>
              <p className="canvas-hint">
                <SquarePen size={15} /> 文字块可编辑；自由书写将在后续阶段接入。
              </p>
            </div>
          )}
        </>
      )}
      {exportStatus && <p role="status">{exportStatus}</p>}
      {draftError && <p role="alert">{draftError}</p>}
      <div className="quick-workspace-foot">
        <FileText size={15} /> {kind === 'import' ? '已导入的笔记可从最近文件打开' : '改动暂存为草稿，点击保存后加入笔记库'}
      </div>
    </section>
  )
}
