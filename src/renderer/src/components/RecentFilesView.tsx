import { useMemo, useState } from 'react'
import { ChevronLeft, FileImage, FileText, PenLine, Plus, Search, Star } from 'lucide-react'

export type RecentFile = {
  id: string
  title: string
  kind: 'note' | 'pdf' | 'image'
  folder: string
  date: string
  summary: string
  favorite: boolean
}

type Props = {
  files: RecentFile[]
  onBack: () => void
  onOpen: (file: RecentFile) => void
  onCreate: () => void
}

export default function RecentFilesView({
  files,
  onBack,
  onOpen,
  onCreate
}: Props): React.JSX.Element {
  const [kind, setKind] = useState<'all' | 'note' | 'pdf' | 'image'>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () =>
      files.filter(
        (file) =>
          (kind === 'all' || file.kind === kind) &&
          `${file.title} ${file.folder} ${file.summary}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())
      ),
    [files, kind, query]
  )
  return (
    <section className="recent-page" aria-label="最近文件列表">
      <div className="recent-page-top">
        <button className="back-link" onClick={onBack}>
          <ChevronLeft size={18} /> 返回首页
        </button>
        <button className="recent-create" onClick={onCreate}>
          <Plus size={17} /> 新建笔记
        </button>
      </div>
      <div className="recent-page-heading">
        <div>
          <h1>最近文件</h1>
          <p>接着上次停下的地方继续。</p>
        </div>
        <span>{visible.length} 个文件</span>
      </div>
      <div className="recent-list-controls">
        <div className="recent-tabs" aria-label="文件类型">
          {(
            [
              ['all', '全部'],
              ['note', '笔记'],
              ['pdf', 'PDF'],
              ['image', '图片']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={kind === value ? 'active' : ''}
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="recent-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索最近文件"
            aria-label="搜索最近文件"
          />
        </label>
      </div>
      <div className="recent-file-list" role="list">
        {visible.length ? (
          visible.map((file) => (
            <div role="listitem" key={file.id}>
              <button className="recent-file-row" onClick={() => onOpen(file)}>
                <span className={`file-symbol ${file.kind}`}>
                  {file.kind === 'pdf' ? (
                    <FileText size={24} />
                  ) : file.kind === 'image' ? (
                    <FileImage size={24} />
                  ) : (
                    <PenLine size={24} />
                  )}
                </span>
                <span className="file-main">
                  <strong>{file.title}</strong>
                  <small>{file.summary}</small>
                </span>
                <span className="file-folder">{file.folder}</span>
                <span className="file-date">{file.date}</span>
                <span className="file-favorite">
                  {file.favorite && <Star size={16} fill="currentColor" aria-label="已收藏" />}
                </span>
              </button>
            </div>
          ))
        ) : (
          <div className="recent-list-empty">没有匹配的文件</div>
        )}
      </div>
    </section>
  )
}
