import { matchesNoteSearch } from '../editor/pdfLibrary'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Tag } from 'lucide-react'

export type TaggedNote = { id: string; title: string; folder: string; date: string; tags: string[]; searchable?: string[] }

export default function TagsView({
  notes,
  catalog,
  onCreateTag,
  onChangeTag,
  onSetNoteTags,
  onBack,
  onOpen
}: {
  notes: TaggedNote[]
  catalog: string[]
  onCreateTag: (tag: string) => void
  onChangeTag: (from: string, to: string | null) => void
  onSetNoteTags: (id: string, tags: string[]) => void
  onBack: () => void
  onOpen: (id: string, query: string) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [operation, setOperation] = useState<'add' | 'rename' | 'delete' | null>(null)
  const [draft, setDraft] = useState('')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const tags = useMemo(() => {
    const counts = new Map<string, number>(catalog.map((tag) => [tag, 0]))
    notes.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  }, [notes, catalog])
  const duplicate = tags.some(([tag]) => tag === draft.trim() && !(operation === 'rename' && tag === selected))
  const visible = notes.filter(
    (note) =>
      (!selected || note.tags.includes(selected)) &&
      matchesNoteSearch([note.title, note.folder, ...note.tags, ...(note.searchable ?? [])], query)
  )
  return (
    <section className="library-page" aria-label="标签页面">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={18} /> 返回首页
      </button>
      <header className="library-heading">
        <div>
          <h1>Tags</h1>
          <p>按主题回到你的笔记</p>
        </div>
        <span>
          {tags.length} 个标签 · {notes.length} 篇笔记
        </span>
      </header>
      <div className="tags-layout">
        <aside className="tags-index" aria-label="标签列表">
          <button onClick={() => { setDraft(''); setOperation('add') }}>＋ 新建标签</button>
          <button className={!selected ? 'selected' : ''} onClick={() => setSelected(null)}>
            <Tag size={17} /> 全部标签 <span>{notes.length}</span>
          </button>
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              className={selected === tag ? 'selected' : ''}
              onClick={() => setSelected(tag)}
            >
              <span className="tag-dot" /> {tag} <span>{count}</span>
            </button>
          ))}
        </aside>
        <div className="tags-results">
          <div className="tags-results-head">
            <div>
              <h2>{selected ?? '全部笔记'}</h2>
              <span>{visible.length} 篇</span>
            </div>
            <label className="recent-search">
              <Search size={17} />
              <input
                aria-label="搜索标签笔记"
                placeholder="搜索笔记或标签"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          {selected && <div className="tag-edit-actions">
            <button onClick={() => { setDraft(selected); setOperation('rename') }}>重命名标签</button>
            <button onClick={() => setOperation('delete')}>删除标签</button>
          </div>}
          {operation && <form className="tag-edit-actions tag-form" onSubmit={(event) => {
            event.preventDefault()
            const value = draft.trim()
            if (operation === 'delete' && selected) { onChangeTag(selected, null); setSelected(null) }
            else if (value && !duplicate) {
              if (operation === 'rename' && selected) onChangeTag(selected, value)
              else if (operation === 'add') onCreateTag(value)
              setSelected(value)
            } else return
            setOperation(null)
          }}>
            {operation === 'delete' ? <span>删除「{selected}」并从关联笔记中移除？</span> :
              <input autoFocus aria-label="标签名称" maxLength={50} value={draft} onChange={(event) => setDraft(event.target.value)} />}
            <button type="button" onClick={() => setOperation(null)}>取消</button>
            <button type="submit" disabled={operation !== 'delete' && (!draft.trim() || duplicate)}>{operation === 'delete' ? '确认删除' : '保存标签'}</button>
            {operation !== 'delete' && duplicate && <small>已存在同名标签</small>}
          </form>}
          <div className="tags-note-list">
            {visible.length ? (
              visible.map((note) => (
                <div key={note.id} className="tag-note-row">
                  <button className="tag-note-open" onClick={() => onOpen(note.id, query)}>
                    <span className="tag-note-icon">
                      <Tag size={18} />
                    </span>
                    <span className="tag-note-main">
                      <strong>{note.title}</strong>
                      <small>
                        {note.folder} · {note.date}
                      </small>
                    </span>
                    <span className="tag-note-chips">
                      {note.tags.map((tag) => (
                        <i key={tag}>{tag}</i>
                      ))}
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button className="tag-note-edit" aria-label={`编辑 ${note.title} 的标签`} aria-expanded={editingNote === note.id} onClick={() => setEditingNote(editingNote === note.id ? null : note.id)}>编辑标签</button>
                  {editingNote === note.id && <div className="tag-edit-actions tag-note-picker">
                    {tags.map(([tag]) => (
                      <label key={tag}><input type="checkbox" checked={note.tags.includes(tag)} disabled={!note.tags.includes(tag) && note.tags.length >= 100}
                        onChange={(event) => onSetNoteTags(note.id, event.target.checked ? [...note.tags, tag] : note.tags.filter((entry) => entry !== tag))} /> {tag}</label>
                    ))}
                  </div>}
                </div>
              ))
            ) : (
              <p className="recent-list-empty">没有匹配的笔记</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
