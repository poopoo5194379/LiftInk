import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, GitBranchPlus, Minus, Plus, Trash2 } from 'lucide-react'
import type { MindMapNode } from '../../../shared/editor'

const nodeWidth = 156
const rowHeight = 58
const columnWidth = 218
const branchColors = ['#7359b4', '#2a756c', '#b66d41', '#a44c76', '#4e72b2']
type PositionedNode = { node: MindMapNode; x: number; y: number; direction: number; color: string }
type Camera = { x: number; y: number; zoom: number }

function zoomAt(camera: Camera, zoom: number, x = 0, y = 0): Camera {
  const next = Math.min(2.4, Math.max(0.35, zoom))
  const ratio = next / camera.zoom
  return { zoom: next, x: x + (camera.x - x) * ratio, y: y + (camera.y - y) * ratio }
}

function layout(nodes: MindMapNode[]): { width: number; height: number; positions: PositionedNode[] } {
  const [root] = nodes
  const positions: PositionedNode[] = []
  const children = new Map<string, MindMapNode[]>()
  for (const node of nodes) {
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  }
  const branches = root.collapsed ? [] : (children.get(root.id) ?? [])
  for (const direction of [-1, 1]) {
    let nextY = 0
    const side: PositionedNode[] = []
    const place = (node: MindMapNode, depth: number, color: string): number => {
      const kids = node.collapsed ? [] : (children.get(node.id) ?? [])
      const rows = kids.map((child) => place(child, depth + 1, color))
      const y = rows.length ? (rows[0] + rows[rows.length - 1]) / 2 : nextY++ * rowHeight
      side.push({ node, x: direction * depth * columnWidth, y, direction, color })
      return y
    }
    branches.forEach((node, index) => {
      if (direction === (index % 2 ? -1 : 1)) place(node, 1, branchColors[index % branchColors.length])
    })
    const midpoint = Math.max(0, nextY - 1) * rowHeight / 2
    positions.push(...side.map((item) => ({ ...item, y: item.y - midpoint })))
  }
  positions.unshift({ node: root, x: 0, y: 0, direction: 0, color: '#6b53a7' })
  const xExtent = Math.max(...positions.map((item) => Math.abs(item.x)))
  const yExtent = Math.max(...positions.map((item) => Math.abs(item.y)))
  const width = xExtent * 2 + nodeWidth + 94
  const height = Math.max(360, yExtent * 2 + 100)
  return { width, height, positions: positions.map((item) => ({ ...item, x: item.x + width / 2, y: item.y + height / 2 })) }
}

export default function MindMapEditor({ nodes, onChange }: {
  nodes: MindMapNode[]; onChange: (nodes: MindMapNode[]) => void
}): React.JSX.Element {
  const root = nodes[0]
  const [selectedId, setSelectedId] = useState(root.id)
  const [editing, setEditing] = useState<string | null>(null)
  const [camera, setCamera] = useState<Camera>({ zoom: 1, x: 0, y: 0 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const space = useRef(false)
  const pan = useRef<{ id: number; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const requestedFocus = useRef<string | null>(null)
  const { width, height, positions } = layout(nodes)
  const byId = new Map(positions.map((item) => [item.node.id, item]))
  const selected = byId.get(selectedId)?.node ?? root
  useLayoutEffect(() => {
    if (!requestedFocus.current) return
    const view = scroll.current
    const item = view?.querySelector<HTMLElement>(`[data-map-node="${CSS.escape(requestedFocus.current)}"]`)
    if (view && item) {
      item.querySelector<HTMLElement>('input,button')?.focus({ preventScroll: true })
      const bounds = view.getBoundingClientRect()
      const topic = item.getBoundingClientRect()
      const dx = Math.max(0, bounds.left + 12 - topic.left) - Math.max(0, topic.right - bounds.right + 12)
      const dy = Math.max(0, bounds.top + 12 - topic.top) - Math.max(0, topic.bottom - bounds.bottom + 12)
      if (dx || dy) setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
    }
    requestedFocus.current = null
  })
  useEffect(() => {
    const view = scroll.current
    if (!view) return
    const wheel = (event: WheelEvent): void => {
      if (!event.deltaX && !event.deltaY) return
      event.preventDefault()
      const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.clientHeight : 1
      if (event.ctrlKey || event.metaKey) {
        const bounds = view.getBoundingClientRect()
        const x = event.clientX - bounds.left - bounds.width / 2
        const y = event.clientY - bounds.top - bounds.height / 2
        setCamera((current) => zoomAt(current, current.zoom * Math.exp(-event.deltaY * step / 550), x, y))
      } else setCamera((current) => ({ ...current, x: current.x - event.deltaX * step, y: current.y - event.deltaY * step }))
    }
    const isSpace = (event: KeyboardEvent): boolean => event.code === 'Space' || event.key === ' '
    const keyDown = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null
      if (!isSpace(event) || event.isComposing || target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (view.contains(target) || view.matches(':hover') || target === document.body) event.preventDefault()
      space.current = true
      setSpaceDown(true)
    }
    const release = (): void => {
      space.current = false
      pan.current = null
      setSpaceDown(false)
      setPanning(false)
    }
    const keyUp = (event: KeyboardEvent): void => { if (isSpace(event)) release() }
    view.addEventListener('wheel', wheel, { passive: false })
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', release)
    return () => {
      view.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', release)
    }
  }, [])

  const endPan = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (pan.current?.id !== event.pointerId) return
    pan.current = null
    setPanning(false)
  }

  const addNode = (parentId: string): void => {
    if (nodes.length >= 150) return
    const child = { id: crypto.randomUUID(), parentId, label: '' }
    onChange([...nodes.map((node) => node.id === parentId ? { ...node, collapsed: false } : node), child])
    setSelectedId(child.id)
    setEditing(child.id)
    requestedFocus.current = child.id
  }
  const removeNode = (): void => {
    if (!selected.parentId) return
    const removing = new Set([selected.id])
    for (const node of nodes) if (node.parentId && removing.has(node.parentId)) removing.add(node.id)
    onChange(nodes.filter((node) => !removing.has(node.id)))
    setSelectedId(selected.parentId)
    requestedFocus.current = selected.parentId
  }
  const toggleBranch = (id: string): void => {
    onChange(nodes.map((node) => node.id === id ? { ...node, collapsed: !node.collapsed } : node))
    setSelectedId(id)
  }

  return <div className="mindmap-workspace" onKeyDown={(event) => {
    if (event.nativeEvent.isComposing || !(event.target as HTMLElement).closest('.mindmap-topic')) return
    if (event.key === 'Tab' && !event.shiftKey && nodes.length < 150) { event.preventDefault(); addNode(selected.id) }
    else if (event.key === 'Enter' && !event.ctrlKey && nodes.length < 150) { event.preventDefault(); addNode(selected.parentId ?? root.id) }
    else if (event.key === 'Delete') { event.preventDefault(); removeNode() }
    else if (event.key === 'F2') { event.preventDefault(); setEditing(selected.id); requestedFocus.current = selected.id }
  }}>
    <div className="canvas-actions map-actions">
      <button onClick={() => addNode(selected.id)} disabled={nodes.length >= 150}><GitBranchPlus size={16} /> 添加子主题</button>
      <button onClick={() => addNode(selected.parentId ?? root.id)} disabled={nodes.length >= 150}><Plus size={16} /> 添加同级</button>
      <button onClick={removeNode} disabled={!selected.parentId} aria-label="删除选中主题"><Trash2 size={16} /></button>
      <div className="map-zoom">
        <button aria-label="缩小导图" disabled={camera.zoom <= 0.35} onClick={() => setCamera((value) => zoomAt(value, value.zoom - 0.15))}><Minus size={16} /></button>
        <button aria-label="重置导图视图" onClick={() => setCamera({ zoom: 1, x: 0, y: 0 })}>{Math.round(camera.zoom * 100)}%</button>
        <button aria-label="放大导图" disabled={camera.zoom >= 2.4} onClick={() => setCamera((value) => zoomAt(value, value.zoom + 0.15))}><Plus size={16} /></button>
      </div>
    </div>
    <div className={`mindmap-scroll${panning ? ' is-panning' : spaceDown ? ' can-pan' : ''}`} ref={scroll}
      onPointerDownCapture={(event) => {
        suppressClick.current = false
        if (!space.current || event.button !== 0 || pan.current) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        pan.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
        suppressClick.current = true
        setPanning(true)
      }}
      onPointerMove={(event) => {
        const drag = pan.current
        if (drag?.id !== event.pointerId) return
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y
        drag.x = event.clientX
        drag.y = event.clientY
        setCamera((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
      }}
      onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}
      onClickCapture={(event) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }}>
      <div className="mindmap-size" style={{ width: width * camera.zoom, height: height * camera.zoom,
        transform: `translate(calc(-50% + ${camera.x}px), calc(-50% + ${camera.y}px))` }}>
        <div className="mindmap-stage" style={{ width, height, transform: `scale(${camera.zoom})` }}>
          <svg width={width} height={height} aria-hidden="true">
            {positions.flatMap(({ node, x, y, direction, color }) => {
              const parent = node.parentId ? byId.get(node.parentId) : undefined
              if (!parent) return []
              const start = parent.x + direction * nodeWidth / 2
              const end = x - direction * nodeWidth / 2
              const middle = (start + end) / 2
              return <path key={node.id} d={`M${start} ${parent.y} C${middle} ${parent.y} ${middle} ${y} ${end} ${y}`} fill="none" stroke={color} strokeWidth={1.7} />
            })}
          </svg>
          {positions.map(({ node, x, y, direction, color }) => (
            <div className={`mindmap-node${node.id === root.id ? ' root' : ''}${selected.id === node.id ? ' selected' : ''}`} key={node.id}
              data-map-node={node.id} style={{ left: x, top: y, width: nodeWidth, '--branch-color': color } as React.CSSProperties}>
              {editing === node.id ? <input aria-label="主题文字" value={node.label} maxLength={120}
                onChange={(event) => onChange(nodes.map((entry) => entry.id === node.id ? { ...entry, label: event.target.value } : entry))}
                onBlur={() => setEditing(null)} onKeyDown={(event) => {
                  if (!event.nativeEvent.isComposing && (event.key === 'Enter' || event.key === 'Escape')) {
                    event.preventDefault(); setEditing(null); requestedFocus.current = node.id
                  }
                }} /> : <button className="mindmap-topic" title={node.label} aria-pressed={selected.id === node.id}
                  onFocus={() => setSelectedId(node.id)} onClick={() => setSelectedId(node.id)}
                  onDoubleClick={() => { setEditing(node.id); requestedFocus.current = node.id }}>
                  {node.label || '未命名主题'}
                </button>}
              {nodes.some((child) => child.parentId === node.id) && <button className={`mindmap-fold${direction < 0 ? ' left' : ''}`}
                aria-label={node.collapsed ? '展开分支' : '收起分支'} aria-expanded={!node.collapsed} onClick={() => toggleBranch(node.id)}>
                {node.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>}
            </div>
          ))}
        </div>
      </div>
    </div>
    <p className="canvas-hint">Ctrl + 滚轮缩放 · 空格 + 拖动平移 · Tab 子主题 · Enter 同级 · F2 编辑</p>
  </div>
}
