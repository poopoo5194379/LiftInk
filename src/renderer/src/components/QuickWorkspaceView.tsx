import { useEffect, useRef, useState } from 'react'
import { flushVaultSettings, getVaultSetting, setVaultSetting } from '../editor/vaultSettings'
import JSZip from 'jszip'
import { base64Of } from '../editor/portable'
import { ChevronLeft, Download, FileImage, FileText, Mic, Plus, SquarePen } from 'lucide-react'
import type { MindMapNode, NoteRecord } from '../../../shared/editor'
import { noteRecordings } from '../../../shared/noteResources'
import { useNoteFocus, type FocusReporter } from '../editor/useNoteFocus'
import { useRecorder } from '../editor/useRecorder'
import { imageAccept } from '../editor/imageAsset'
import AudioTranscription from './AudioTranscription'
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
    // A recording or transcription can finish after this editor has been left.
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
  const [seconds, setSeconds] = useState(0)
  const [selectedRecording, setSelectedRecording] = useState('')
  const [voiceUrl, setVoiceUrl] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const voiceAudio = useRef<HTMLAudioElement>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const recordings = noteRecordings(snapshot.draft)
  const currentRecording = recordings.find((item) => item.id === selectedRecording) ?? recordings.at(-1)
  const voiceId = currentRecording?.assetId
  const voiceResult = currentRecording?.transcript
  const recorder = useRecorder((item) => {
    update((current) => ({
      ...current,
      draft: { ...current.draft, recordings: [...noteRecordings(current.draft), item],
        audioAssetId: item.assetId, audioTranscript: undefined }
    }))
    setSelectedRecording(item.id)
  }, setVoiceError)
  const [root = '中心主题', ...branches] = snapshot.draft.nodes ?? []
  const mindMap: MindMapNode[] = snapshot.draft.mindMap?.length ? snapshot.draft.mindMap :
    [{ id: 'root', label: root }, ...branches.map((label, index) => ({ id: `branch-${index}`, label, parentId: 'root' }))]
  const boardItems = snapshot.draft.boardItems ?? []
  useEffect(() => {
    setVoiceUrl('')
    if (!voiceId) return
    let cancelled = false
    void window.liftInk.loadMedia(voiceId).then(({ dataUrl }) => {
      if (!cancelled) setVoiceUrl(dataUrl)
    }).catch(() => { if (!cancelled) setVoiceError('无法读取已保存录音') })
    return () => { cancelled = true }
  }, [voiceId])
  useEffect(() => {
    if (!recorder.recording) return
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [recorder.recording])

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
      let path: string | null
      if (kind === 'mindmap') {
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
        path = await window.liftInk.saveExport('md', title, base64Of(bytes))
      } else {
        const zip = new JSZip()
        zip.file('速记.txt', latest.current.draft.transcript)
        for (const [index, item] of recordings.entries()) {
          const name = `录音-${index + 1}`
          zip.file(`${name}.webm`, (await window.liftInk.loadMedia(item.assetId)).dataUrl.split(',')[1], { base64: true })
          if (item.transcript?.text) zip.file(`${name}.txt`, item.transcript.text)
        }
        const bytes = await zip.generateAsync({ type: 'uint8array' })
        path = await window.liftInk.saveExport('zip', title, base64Of(bytes))
      }
      if (path) setExportStatus('已导出')
    } catch (error) { setExportStatus(`导出失败：${String(error)}`) }
    finally { setExporting(false) }
  }
  const label =
    kind === 'voice'
      ? '语音速记'
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
        <span>{kind === 'voice' ? '本地录音' : kind === 'import' ? '导入本机文件' : '本地工作区'}</span>
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
            {(kind === 'mindmap' || kind === 'voice') && <button className="recent-create recent-create-secondary"
              disabled={exporting || recorder.recording || recorder.busy} onClick={() => void exportContent()}>
              <Download size={15} /> {kind === 'mindmap' ? '导出 Markdown 大纲' : '导出录音和文字'}
            </button>}
            <button
              className="recent-create"
              disabled={saving || recorder.recording || recorder.busy}
              onClick={() => void save()}
            >
              {initialNote ? '保存修改' : '保存到未分类'}
            </button>
            </div>
          </div>
          {kind === 'voice' ? (
            <div className="voice-workspace">
              <div className="voice-recorder">
                <Mic size={31} />
                <strong>
                  {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                  {String(seconds % 60).padStart(2, '0')}
                </strong>
                <button disabled={recorder.busy} onClick={() => {
                  setVoiceError('')
                  if (recorder.recording) void recorder.stop().catch(() => undefined)
                  else { setSeconds(0); void recorder.start() }
                }}>
                  {recorder.recording ? '停止录音' : recorder.busy ? '处理中…' : '开始录音'}
                </button>
                {voiceError && <p role="alert">{voiceError}</p>}
                {recordings.length > 1 && <select aria-label="选择速记录音" value={currentRecording?.id} onChange={(event) => setSelectedRecording(event.target.value)}>
                  {recordings.map((item, index) => <option key={item.id} value={item.id}>录音 {index + 1}</option>)}
                </select>}
                {voiceUrl && <audio ref={voiceAudio} src={voiceUrl} controls aria-label="语音速记录音" />}
                {voiceId && voiceUrl && <AudioTranscription key={voiceId} assetId={voiceId} url={voiceUrl} result={voiceResult}
                  retainResult
                  onResult={(result) => update((current) => {
                    const sessions = noteRecordings(current.draft)
                    const matching = sessions.find((item) => item.id === currentRecording?.id)
                    if (!matching) return current
                    const previous = matching.transcript?.text ?? ''
                    const transcript = previous && current.draft.transcript.includes(previous)
                      ? current.draft.transcript.replace(previous, result.text)
                      : [current.draft.transcript.trim(), result.text].filter(Boolean).join('\n\n')
                    return {
                      ...current,
                      draft: { ...current.draft, transcript,
                        recordings: sessions.map((item) => item.id === matching.id ? { ...item, transcript: result } : item),
                        audioTranscript: sessions.at(-1)?.id === matching.id ? result : current.draft.audioTranscript }
                    }
                  })}
                  onSeek={(seconds) => {
                    if (voiceAudio.current) {
                      voiceAudio.current.currentTime = seconds
                      void voiceAudio.current.play().catch(() => undefined)
                    }
                  }}
                />}
              </div>
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
