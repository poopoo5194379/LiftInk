import { useEffect, useState } from 'react'
import { ChevronLeft, FileImage, FileText, Mic, Network, Plus, SquarePen } from 'lucide-react'

export type QuickKind = 'voice' | 'import' | 'mindmap' | 'whiteboard'
export type QuickDraft = { transcript: string; nodes: string[]; boardItems: string[] }
type ImportItem = { name: string; kind: 'pdf' | 'image' }

export default function QuickWorkspaceView({
  kind,
  initialNote,
  onBack,
  onSave,
  onImport
}: {
  kind: QuickKind
  initialNote?: { title: string; draft?: QuickDraft }
  onBack: () => void
  onSave: (
    title: string,
    kind: 'voice' | 'map' | 'board',
    summary: string,
    draft: QuickDraft
  ) => void
  onImport: (files: ImportItem[]) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(
    initialNote?.title ??
      (kind === 'voice' ? '语音速记' : kind === 'mindmap' ? '未命名思维导图' : '未命名白板')
  )
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState(initialNote?.draft?.transcript ?? '')
  const [nodes, setNodes] = useState(initialNote?.draft?.nodes ?? ['中心主题', '分支一', '分支二'])
  const [boardItems, setBoardItems] = useState(initialNote?.draft?.boardItems ?? ['从一个想法开始'])
  const [busy, setBusy] = useState(false)
  const [importError, setImportError] = useState('')
  useEffect(() => {
    if (!recording) return
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [recording])
  const chooseFiles = async (): Promise<void> => {
    setBusy(true)
    setImportError('')
    try {
      const selected = await window.liftInk.chooseImports()
      if (selected.length) onImport(selected)
    } catch {
      setImportError('选择文件失败，请重试')
    } finally {
      setBusy(false)
    }
  }
  const label =
    kind === 'voice'
      ? '语音速记'
      : kind === 'import'
        ? '导入 PDF / 图片'
        : kind === 'mindmap'
          ? '思维导图'
          : '白板'
  return (
    <section className="quick-workspace" aria-label={`${label}页面`}>
      <header className="quick-workspace-bar">
        <button className="back-link" onClick={onBack}>
          <ChevronLeft size={18} /> 返回
        </button>
        <span>本次会话预览</span>
      </header>
      {kind === 'import' ? (
        <div className="import-workspace">
          <FileImage size={36} />
          <h1>导入 PDF 或图片</h1>
          <p>选择本机文件后，文件名会出现在最近文件列表。当前阶段不读取内容或创建 PDF 编辑副本。</p>
          <button className="recent-create" onClick={chooseFiles} disabled={busy}>
            {busy ? '正在选择…' : '选择文件'}
          </button>
          <small>支持 PDF、PNG、JPG、WebP · 单次最多 10 个</small>
          {importError && <p role="alert">{importError}</p>}
        </div>
      ) : (
        <>
          <div className="quick-workspace-heading">
            <div>
              <span>{label}</span>
              <input
                aria-label="内容标题"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <button
              className="recent-create"
              onClick={() =>
                onSave(
                  title.trim() || label,
                  kind === 'mindmap' ? 'map' : kind === 'whiteboard' ? 'board' : 'voice',
                  kind === 'voice'
                    ? transcript.trim() || '语音速记草稿'
                    : kind === 'mindmap'
                      ? nodes.join(' · ')
                      : boardItems.join(' · '),
                  { transcript, nodes, boardItems }
                )
              }
            >
              {initialNote ? '保存修改' : '保存到未分类'}
            </button>
          </div>
          {kind === 'voice' ? (
            <div className="voice-workspace">
              <div className="voice-recorder">
                <Mic size={31} />
                <strong>
                  {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                  {String(seconds % 60).padStart(2, '0')}
                </strong>
                <button onClick={() => setRecording(!recording)}>
                  {recording ? '停止计时' : '开始计时'}
                </button>
                <p>计时与文字整理可先体验；音频录制及识别尚未接入。</p>
              </div>
              <label className="voice-transcript">
                速记文字
                <textarea
                  aria-label="速记文字"
                  placeholder="在这里整理刚刚想到的内容…"
                  value={transcript}
                  onChange={(event) => setTranscript(event.target.value)}
                />
              </label>
            </div>
          ) : kind === 'mindmap' ? (
            <div className="mindmap-workspace">
              <div className="canvas-actions">
                <span>主题与分支</span>
                <button
                  onClick={() => setNodes((current) => [...current, `新分支 ${current.length}`])}
                >
                  <Plus size={16} /> 添加分支
                </button>
              </div>
              <div className="mindmap-canvas">
                <input
                  aria-label="中心主题"
                  value={nodes[0]}
                  onChange={(event) =>
                    setNodes((current) =>
                      current.map((node, index) => (index === 0 ? event.target.value : node))
                    )
                  }
                />
                <div>
                  {nodes.slice(1).map((node, index) => (
                    <input
                      key={index}
                      aria-label={`分支 ${index + 1}`}
                      value={node}
                      onChange={(event) =>
                        setNodes((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index + 1 ? event.target.value : item
                          )
                        )
                      }
                    />
                  ))}
                </div>
              </div>
              <p className="canvas-hint">
                <Network size={15} /> 可新增并编辑主题节点；自由连线将在后续阶段接入。
              </p>
            </div>
          ) : (
            <div className="whiteboard-workspace">
              <div className="canvas-actions">
                <span>文字白板</span>
                <button onClick={() => setBoardItems((current) => [...current, '新的想法'])}>
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
                      setBoardItems((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === index ? event.target.value : value
                        )
                      )
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
      <div className="quick-workspace-foot">
        <FileText size={15} /> 本次会话中的草稿，不会写入磁盘
      </div>
    </section>
  )
}
