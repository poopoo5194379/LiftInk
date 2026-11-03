import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Search, Tag } from 'lucide-react'

export type TaggedNote = { id: string; title: string; folder: string; date: string; tags: string[] }

export default function TagsView({
  notes,
  onBack,
  onOpen
}: {
  notes: TaggedNote[]
  onBack: () => void
  onOpen: (id: string) => void
}): React.JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    notes.forEach((note) => note.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)))
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
  }, [notes])
  const visible = notes.filter(
    (note) =>
      (!selected || note.tags.includes(selected)) &&
      `${note.title} ${note.folder} ${note.tags.join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase())
  )
  return (
    <section className="library-page" aria-label="Tags 页面">
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
          <div className="tags-note-list">
            {visible.length ? (
              visible.map((note) => (
                <button key={note.id} onClick={() => onOpen(note.id)}>
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
