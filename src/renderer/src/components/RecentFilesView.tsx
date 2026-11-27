import { matchesNoteSearch } from '../editor/pdfLibrary'
import { useMemo, useState } from 'react'
import { ChevronLeft, Folder, Plus, Search, Star } from 'lucide-react'
import NoteFileIcon from './NoteFileIcon'

export type RecentFile = {
  id: string
  title: string
  kind: 'note' | 'pdf' | 'image'
  folder: string
  date: string
  dateDetail?: string
  summary: string
  favorite: boolean
  managed?: boolean
  searchable?: string[]
}

type Props = {
  files: RecentFile[]
  onBack: () => void
  onOpen: (file: RecentFile, query: string) => void
  onCreate: () => void
  onCreateMarkdown?: () => void
  folder?: string
  favorites?: boolean
  subfolders?: string[]
  onOpenFolder?: (folder: string) => void
  renderActions?: (file: RecentFile) => React.ReactNode
  layout?: 'list' | 'grid'
}

export default function RecentFilesView({
  files,
  onBack,
  onOpen,
  onCreate,
  onCreateMarkdown,
  folder,
  favorites,
  subfolders = [],
  onOpenFolder,
  renderActions,
  layout = 'list'
}: Props): React.JSX.Element {
  const [kind, setKind] = useState<'all' | 'note' | 'pdf' | 'image'>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(
    () =>
      files.filter(
        (file) =>
          (kind === 'all' || file.kind === kind) &&
          matchesNoteSearch([file.title, file.folder, file.summary, ...(file.searchable ?? [])], query)
      ),
    [files, kind, query]
  )
  const folderParts = folder?.split(' / ') ?? []
  const parent = folderParts.slice(0, -1).join(' / ')
  const searchLabel = folder ? '搜索当前目录' : favorites ? '搜索常用文件' : '搜索最近文件'
  return (
    <section className={`recent-page file-layout-${layout}`} aria-label={folder ? '文件夹目录' : favorites ? '常用文件列表' : '最近文件列表'}>
      <div className="recent-page-top">
        <button className="back-link" onClick={() => (parent ? onOpenFolder?.(parent) : onBack())}>
          <ChevronLeft size={18} /> {parent ? '返回上一级' : '返回首页'}
        </button>
        <div className="recent-heading-actions">
        {onCreateMarkdown && <button className="recent-create recent-create-secondary" onClick={onCreateMarkdown}>新建 Markdown</button>}
        <button className="recent-create" onClick={onCreate}>
          <Plus size={17} /> 新建笔记
        </button>
        </div>
      </div>
      <div className="recent-page-heading">
        <div>
          <h1>{folderParts.at(-1) ?? (favorites ? '常用文件' : '最近文件')}</h1>
          <p>{folder ?? (favorites ? '收藏的笔记和文件。' : '接着上次停下的地方继续。')}</p>
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
            placeholder={searchLabel}
            aria-label={searchLabel}
          />
        </label>
      </div>
      <div className="recent-file-list" role="list">
        {!query.trim() &&
          kind === 'all' &&
          subfolders.map((path) => (
            <div role="listitem" key={path}>
              <button className="recent-file-row" onClick={() => onOpenFolder?.(path)}>
                <span className="file-symbol">
                  <Folder size={24} />
                </span>
                <span className="file-main">
                  <strong>{path.split(' / ').at(-1)}</strong>
                  <small>文件夹</small>
                </span>
              </button>
            </div>
          ))}
        {visible.length
          ? visible.map((file) => (
              <div
                role="listitem"
                key={file.id}
                className={renderActions && file.managed ? 'recent-file-item' : undefined}
              >
                <button
                  className="recent-file-row"
                  draggable={!!renderActions && file.managed}
                  onDragStart={(event) =>
                    event.dataTransfer.setData('application/x-liftink-note', file.id)
                  }
                  onClick={() => onOpen(file, query)}
                >
                  <span className={`file-symbol ${file.kind}`}>
                    <NoteFileIcon kind={file.kind} />
                  </span>
                  <span className="file-main">
                    <strong>{file.title}</strong>
                    <small>{file.summary}</small>
                  </span>
                  <span className="file-folder">{file.folder}</span>
                  <span className="file-date" title={file.dateDetail}>{file.date}</span>
                  <span className="file-favorite">
                    {file.favorite && <Star size={16} fill="currentColor" aria-label="已收藏" />}
                  </span>
                </button>
                {renderActions?.(file)}
              </div>
            ))
          : (subfolders.length === 0 || query.trim() || kind !== 'all') && (
              <div className="recent-list-empty">
                {folder && !query.trim() && kind === 'all' ? '此文件夹暂无文件' : '没有匹配的文件'}
              </div>
            )}
      </div>
    </section>
  )
}
