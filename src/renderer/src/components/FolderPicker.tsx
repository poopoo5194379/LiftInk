import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Folder, Search } from 'lucide-react'

type Props = {
  value: string
  folders: string[]
  onChange: (folder: string) => void
}

export default function FolderPicker({ value, folders, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const visible = folders.filter((folder) =>
    folder.toLowerCase().includes(query.trim().toLowerCase())
  )
  return (
    <div className="folder-picker" ref={root}>
      <button
        className="folder-picker-trigger"
        aria-label="笔记位置"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen(!open)
          setQuery('')
        }}
      >
        <Folder size={16} />
        <span>分区 · {value}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="folder-picker-popover">
          <label className="folder-picker-search">
            <Search size={15} />
            <input
              autoFocus
              aria-label="搜索分区"
              placeholder="搜索分区"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false)
                if (event.key === 'Enter' && visible[0]) {
                  onChange(visible[0])
                  setOpen(false)
                }
              }}
            />
          </label>
          <div role="listbox" aria-label="选择分区">
            {visible.length ? (
              visible.map((folder) => (
                <button
                  key={folder}
                  role="option"
                  aria-selected={folder === value}
                  onClick={() => {
                    onChange(folder)
                    setOpen(false)
                  }}
                >
                  <Folder size={15} />
                  <span>{folder}</span>
                  {folder === value && <Check size={15} />}
                </button>
              ))
            ) : (
              <p>没有匹配的分区</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
