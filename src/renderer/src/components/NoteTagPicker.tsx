import { useState } from 'react'
import { Tag } from 'lucide-react'
import { EditorButton, ToolPopover } from './EditorControls'

export default function NoteTagPicker({ tags, catalog, onChange, onCreate }: {
  tags: string[]
  catalog: string[]
  onChange: (tags: string[]) => void
  onCreate: (tag: string) => void
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [draft, setDraft] = useState('')
  const options = [...new Set([...tags, ...catalog])].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  const canAdd = tags.length < 100
  return <>
    <EditorButton aria-label="编辑笔记标签" aria-expanded={!!anchor} help={tags.join('、') || '为这篇笔记选择或新建标签。'}
      className="note-tag-trigger" onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}>
      <Tag size={16} /> 标签{tags.length ? ` ${tags.length}` : ''}
    </EditorButton>
    {anchor && <ToolPopover anchor={anchor} label="笔记标签" onClose={() => setAnchor(null)}>
      <div className="note-tag-options">
        {options.map((tag) => <label key={tag}><input type="checkbox" checked={tags.includes(tag)} disabled={!canAdd && !tags.includes(tag)}
          onChange={(event) => onChange(event.target.checked ? [...tags, tag] : tags.filter((value) => value !== tag))} />{tag}</label>)}
      </div>
      <form className="note-tag-create" onSubmit={(event) => {
        event.preventDefault()
        const tag = draft.trim().normalize('NFKC')
        if (!tag || !canAdd || tag.length > 200) return
        if (!options.includes(tag)) onCreate(tag)
        if (!tags.includes(tag)) onChange([...tags, tag])
        setDraft('')
      }}>
        <input aria-label="新标签名称" value={draft} maxLength={32} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={!canAdd || !draft.trim()}>添加</button>
      </form>
    </ToolPopover>}
  </>
}
