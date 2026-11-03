import { useEffect, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import { ChevronLeft, Eraser, Hand, LassoSelect, PenLine, RotateCcw, Trash2 } from 'lucide-react'

type Tool = 'pen' | 'eraser' | 'lasso' | 'hand' | 'picker'
type Point = {
  x: number
  y: number
  pressure: number
  rawX?: number
  rawY?: number
  rawPressure?: number
  time: number
}
type Stroke = { id: number; color: string; width: number; points: Point[] }
type PointerReadout = {
  type: string
  pointerType: string
  pointerId: number
  pressure: number
  buttons: number
  button: number
  tiltX: number
  tiltY: number
  twist: number
  coalesced: number
  tool: Tool
}
type Drag = {
  id: number
  tool: Tool
  startX: number
  startY: number
  panX: number
  panY: number
  points: Point[]
  stroke?: Stroke
}

const palette = ['#433654', '#7461ba', '#c96f91', '#577da4', '#c49049']
const toolLabels: Record<Tool, string> = {
  pen: '钢笔',
  eraser: '橡皮擦',
  lasso: '套索',
  hand: '平移',
  picker: '吸色'
}

function distanceToSegment(x: number, y: number, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy))
}
function insidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j]
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside
  }
  return inside
}

export default function PenInputPocView({ onBack }: { onBack: () => void }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef<Stroke[]>([])
  const selectedRef = useRef<Set<number>>(new Set())
  const dragRef = useRef<Drag | null>(null)
  const hoverRef = useRef<{ x: number; y: number; type: string } | null>(null)
  const viewRef = useRef({ x: 0, y: 0, zoom: 1 })
  const keysRef = useRef({ space: false, alt: false })
  const frameRef = useRef(0)
  const redrawRef = useRef<() => void>(() => {})
  const lastMetricRef = useRef(0)
  const forceMetricRef = useRef(false)
  const idRef = useRef(1)
  const lastReadoutRef = useRef(0)
  const lastPointerTypeRef = useRef('')
  const lastButtonsRef = useRef(-1)
  const configRef = useRef({
    tool: 'pen' as Tool,
    color: palette[0],
    width: 3,
    smoothing: true,
    side: 'none' as 'none' | 'eraser' | 'lasso',
    renderer: 'segments' as 'segments' | 'freehand',
    pressureWidth: true,
    coalesced: true,
    stream: 'move' as 'move' | 'raw'
  })
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(palette[0])
  const [width, setWidth] = useState(3)
  const [smoothing, setSmoothing] = useState(true)
  const [side, setSide] = useState<'none' | 'eraser' | 'lasso'>('none')
  const [renderer, setRenderer] = useState<'segments' | 'freehand'>('segments')
  const [pressureWidth, setPressureWidth] = useState(true)
  const [coalesced, setCoalesced] = useState(true)
  const [stream, setStream] = useState<'move' | 'raw'>('move')
  const rawAvailable = typeof window !== 'undefined' && 'onpointerrawupdate' in window
  const [readout, setReadout] = useState<PointerReadout | null>(null)
  const [events, setEvents] = useState<string[]>([])
  const [counts, setCounts] = useState({ strokes: 0, points: 0, selected: 0 })
  const [renderMs, setRenderMs] = useState(0)
  const [pressureRange, setPressureRange] = useState('—')
  const [viewLabel, setViewLabel] = useState('100%')
  const [testStatus, setTestStatus] = useState('等待输入')
  useEffect(() => {
    configRef.current = {
      tool,
      color,
      width,
      smoothing,
      side,
      renderer,
      pressureWidth,
      coalesced,
      stream
    }
    forceMetricRef.current = true
    redrawRef.current()
  }, [tool, color, width, smoothing, side, renderer, pressureWidth, coalesced, stream])

  useEffect(() => {
    const host = hostRef.current,
      canvas = canvasRef.current
    if (!host || !canvas) return
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) return
    const outlineCache = new Map<string, Path2D>()
    const updateCounts = (): void =>
      setCounts({
        strokes: strokesRef.current.length,
        points: strokesRef.current.reduce((sum, stroke) => sum + stroke.points.length, 0),
        selected: selectedRef.current.size
      })
    const worldPoint = (clientX: number, clientY: number): Point => {
      const rect = canvas.getBoundingClientRect(),
        view = viewRef.current
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
        pressure: 0.5,
        time: performance.now()
      }
    }
    const effectiveTool = (event?: PointerEvent): Tool => {
      if (keysRef.current.space) return 'hand'
      if (keysRef.current.alt) return 'picker'
      if (event?.pointerType === 'pen' && (event.button === 5 || !!(event.buttons & 32)))
        return 'eraser'
      if (
        event?.pointerType === 'pen' &&
        (event.button === 2 || !!(event.buttons & 2)) &&
        configRef.current.side !== 'none'
      )
        return configRef.current.side
      return configRef.current.tool
    }
    const drawStroke = (stroke: Stroke, selected: boolean, complete = true): void => {
      const points = stroke.points
      if (!points.length) return
      context.strokeStyle = selected ? '#4d8dcc' : stroke.color
      context.fillStyle = context.strokeStyle
      context.lineCap = 'round'
      context.lineJoin = 'round'
      if (configRef.current.renderer === 'freehand' && points.length > 1) {
        const key = `${stroke.id}:${configRef.current.pressureWidth}`
        let path = complete ? outlineCache.get(key) : undefined
        if (!path) {
          const outline = getStroke(
            points.map((point) => [
              point.x,
              point.y,
              configRef.current.pressureWidth ? point.pressure : 0.5
            ]),
            {
              size: stroke.width * 2,
              thinning: 0.65,
              smoothing: 0.5,
              streamline: 0.35,
              simulatePressure: false,
              last: complete
            }
          )
          path = new Path2D()
          if (outline.length) {
            path.moveTo(outline[0][0], outline[0][1])
            outline.slice(1).forEach(([x, y]) => path!.lineTo(x, y))
            path.closePath()
          }
          if (complete) outlineCache.set(key, path)
        }
        context.fill(path)
        return
      }
      if (points.length === 1) {
        context.beginPath()
        context.arc(
          points[0].x,
          points[0].y,
          Math.max(0.5, stroke.width * points[0].pressure),
          0,
          Math.PI * 2
        )
        context.fill()
      }
      for (let index = 1; index < points.length; index++) {
        const previous = points[index - 1],
          current = points[index]
        context.lineWidth = Math.max(
          0.7,
          stroke.width *
            (configRef.current.pressureWidth ? previous.pressure + current.pressure : 1)
        )
        context.beginPath()
        context.moveTo(previous.x, previous.y)
        context.lineTo(current.x, current.y)
        context.stroke()
      }
    }
    const draw = (): void => {
      frameRef.current = 0
      const started = performance.now(),
        dpr = window.devicePixelRatio || 1
      const { width: cssWidth, height: cssHeight } = canvas.getBoundingClientRect()
      if (
        canvas.width !== Math.round(cssWidth * dpr) ||
        canvas.height !== Math.round(cssHeight * dpr)
      ) {
        canvas.width = Math.round(cssWidth * dpr)
        canvas.height = Math.round(cssHeight * dpr)
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.fillStyle = '#fffefc'
      context.fillRect(0, 0, cssWidth, cssHeight)
      const view = viewRef.current
      context.translate(view.x, view.y)
      context.scale(view.zoom, view.zoom)
      for (const stroke of strokesRef.current)
        drawStroke(stroke, selectedRef.current.has(stroke.id))
      const drag = dragRef.current
      if (drag?.tool === 'pen' && drag.stroke) drawStroke(drag.stroke, false, false)
      if (drag?.tool === 'lasso' && drag.points.length > 1) {
        context.beginPath()
        context.moveTo(drag.points[0].x, drag.points[0].y)
        drag.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
        context.setLineDash([5 / view.zoom, 4 / view.zoom])
        context.lineWidth = 1 / view.zoom
        context.strokeStyle = '#6c5bd3'
        context.stroke()
        context.setLineDash([])
      }
      const hover = hoverRef.current
      if (hover?.type === 'pen') {
        context.beginPath()
        context.arc(
          hover.x,
          hover.y,
          Math.max(4, configRef.current.width * 1.5) / view.zoom,
          0,
          Math.PI * 2
        )
        context.lineWidth = 1 / view.zoom
        context.strokeStyle = '#7159c8'
        context.stroke()
      }
      const duration = performance.now() - started
      canvas.dataset.renderMs = duration.toFixed(2)
      canvas.dataset.frameCount = String(Number(canvas.dataset.frameCount || '0') + 1)
      if (forceMetricRef.current || performance.now() - lastMetricRef.current > 220) {
        forceMetricRef.current = false
        lastMetricRef.current = performance.now()
        setRenderMs(Math.round(duration * 10) / 10)
      }
    }
    const scheduleDraw = (): void => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(draw)
    }
    redrawRef.current = scheduleDraw
    const logEvent = (event: PointerEvent, suffix = ''): void =>
      setEvents((current) =>
        [
          `${event.type} · ${event.pointerType} · button ${event.button} / buttons ${event.buttons}${suffix}`,
          ...current
        ].slice(0, 8)
      )
    const sample = (event: PointerEvent): PointerEvent[] => {
      if (!configRef.current.coalesced || typeof event.getCoalescedEvents !== 'function')
        return [event]
      const events = event.getCoalescedEvents()
      return events.length ? events : [event]
    }
    const read = (event: PointerEvent, active: Tool): void => {
      if (event.buttons !== lastButtonsRef.current) {
        lastButtonsRef.current = event.buttons
        logEvent(event)
      }
      if (
        (event.type === 'pointermove' || event.type === 'pointerrawupdate') &&
        event.pointerType === lastPointerTypeRef.current &&
        performance.now() - lastReadoutRef.current < 80
      )
        return
      lastReadoutRef.current = performance.now()
      lastPointerTypeRef.current = event.pointerType
      setReadout({
        type: event.type,
        pointerType: event.pointerType,
        pointerId: event.pointerId,
        pressure: event.pressure,
        buttons: event.buttons,
        button: event.button,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        twist: event.twist,
        coalesced: sample(event).length,
        tool: active
      })
    }
    const addSamples = (event: PointerEvent, drag: Drag): void => {
      for (const entry of sample(event)) {
        const raw = worldPoint(entry.clientX, entry.clientY)
        const previous = drag.points.at(-1)
        const pressure = event.pointerType === 'pen' ? Math.max(0.05, entry.pressure) : 0.5
        const point = {
          ...raw,
          rawX: raw.x,
          rawY: raw.y,
          rawPressure: entry.pressure,
          x: previous && configRef.current.smoothing ? previous.x * 0.22 + raw.x * 0.78 : raw.x,
          y: previous && configRef.current.smoothing ? previous.y * 0.22 + raw.y * 0.78 : raw.y,
          pressure:
            previous && configRef.current.smoothing
              ? previous.pressure * 0.35 + pressure * 0.65
              : pressure,
          time: entry.timeStamp
        }
        if (
          !previous ||
          Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.35 / viewRef.current.zoom
        )
          drag.points.push(point)
      }
      scheduleDraw()
    }
    const hitStroke = (point: Point): Stroke | undefined =>
      [...strokesRef.current]
        .reverse()
        .find((stroke) =>
          stroke.points.some(
            (p, index) =>
              index > 0 &&
              distanceToSegment(point.x, point.y, stroke.points[index - 1], p) <
                Math.max(9 / viewRef.current.zoom, stroke.width * 2)
          )
        )
    const pointerDown = (event: PointerEvent): void => {
      if (dragRef.current) return
      if (
        (event.pointerType === 'pen' && !(event.buttons & 1) && !(event.buttons & 32)) ||
        (event.pointerType === 'mouse' && event.button !== 0)
      ) {
        setTestStatus(
          event.pointerType === 'pen' ? '笔侧键悬停：只记录事件' : '非主按钮：只记录事件'
        )
        logEvent(event, ' · 未落笔')
        read(event, effectiveTool(event))
        return
      }
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      const active = effectiveTool(event),
        point = worldPoint(event.clientX, event.clientY)
      const drag: Drag = {
        id: event.pointerId,
        tool: active,
        startX: event.clientX,
        startY: event.clientY,
        panX: viewRef.current.x,
        panY: viewRef.current.y,
        points: []
      }
      if (active === 'pen')
        drag.stroke = {
          id: idRef.current++,
          color: configRef.current.color,
          width: configRef.current.width,
          points: drag.points
        }
      dragRef.current = drag
      if (active === 'pen' || active === 'lasso') addSamples(event, drag)
      if (active === 'picker') {
        const found = hitStroke(point)
        if (found) setColor(found.color)
      }
      if (active === 'eraser') {
        const found = hitStroke(point)
        if (found) {
          strokesRef.current = strokesRef.current.filter((stroke) => stroke.id !== found.id)
          selectedRef.current.delete(found.id)
          updateCounts()
        }
      }
      hoverRef.current = null
      logEvent(event, ` · ${toolLabels[active]}`)
      read(event, active)
      setTestStatus(`${event.pointerType || '未知设备'} · ${toolLabels[active]}`)
      scheduleDraw()
    }
    const pointerMove = (event: PointerEvent): void => {
      const active = effectiveTool(event),
        point = worldPoint(event.clientX, event.clientY)
      let drag = dragRef.current
      if (drag?.id === event.pointerId) {
        event.preventDefault()
        if (drag.tool !== active) {
          if (drag.tool === 'pen' && drag.stroke && drag.points.length)
            strokesRef.current.push(drag.stroke)
          if (drag.tool === 'lasso' && drag.points.length > 2)
            selectedRef.current = new Set(
              strokesRef.current
                .filter((stroke) =>
                  stroke.points.some((entry) => insidePolygon(entry, drag!.points))
                )
                .map((stroke) => stroke.id)
            )
          drag = {
            id: event.pointerId,
            tool: active,
            startX: event.clientX,
            startY: event.clientY,
            panX: viewRef.current.x,
            panY: viewRef.current.y,
            points: []
          }
          if (active === 'pen')
            drag.stroke = {
              id: idRef.current++,
              color: configRef.current.color,
              width: configRef.current.width,
              points: drag.points
            }
          dragRef.current = drag
          updateCounts()
          logEvent(event, ` · 切换到${toolLabels[active]}`)
        }
        if (drag.tool === 'hand') {
          viewRef.current.x = drag.panX + event.clientX - drag.startX
          viewRef.current.y = drag.panY + event.clientY - drag.startY
        } else if (
          (drag.tool === 'pen' || drag.tool === 'lasso') &&
          (configRef.current.stream === 'raw') === (event.type === 'pointerrawupdate')
        )
          addSamples(event, drag)
        else if (drag.tool === 'picker') {
          const found = hitStroke(point)
          if (found) setColor(found.color)
        } else if (drag.tool === 'eraser') {
          const found = hitStroke(point)
          if (found) {
            strokesRef.current = strokesRef.current.filter((stroke) => stroke.id !== found.id)
            selectedRef.current.delete(found.id)
            updateCounts()
          }
        }
      } else
        hoverRef.current =
          event.pointerType === 'pen' && !(event.buttons & 1) && !(event.buttons & 32)
            ? { x: point.x, y: point.y, type: 'pen' }
            : null
      if (!drag && hoverRef.current) setTestStatus('笔尖悬停：没有落墨')
      read(event, drag?.tool ?? active)
      scheduleDraw()
    }
    const finish = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (!drag || drag.id !== event.pointerId) {
        if (event.type !== 'lostpointercapture') read(event, effectiveTool(event))
        logEvent(event)
        return
      }
      if (event.type === 'pointerup' && drag.tool === 'pen' && drag.stroke && drag.points.length) {
        strokesRef.current.push(drag.stroke)
        const pressures = drag.points.map((point) => point.rawPressure ?? point.pressure)
        setPressureRange(
          `${Math.min(...pressures).toFixed(2)}–${Math.max(...pressures).toFixed(2)}`
        )
      }
      if (event.type === 'pointerup' && drag.tool === 'lasso' && drag.points.length > 2) {
        selectedRef.current = new Set(
          strokesRef.current
            .filter((stroke) => stroke.points.some((point) => insidePolygon(point, drag.points)))
            .map((stroke) => stroke.id)
        )
      }
      dragRef.current = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (event.type !== 'pointerup') {
        keysRef.current.space = false
        keysRef.current.alt = false
        setTestStatus('输入中断，临时工具已恢复')
      } else if (drag.tool === 'pen') {
        setTestStatus('笔迹已记录')
      }
      updateCounts()
      read(event, effectiveTool(event))
      logEvent(event)
      scheduleDraw()
    }
    const leave = (): void => {
      hoverRef.current = null
      scheduleDraw()
    }
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      if (event.ctrlKey) {
        const rect = canvas.getBoundingClientRect(),
          view = viewRef.current
        const localX = event.clientX - rect.left,
          localY = event.clientY - rect.top
        const scale = Math.max(0.25, Math.min(4, view.zoom * Math.exp(-event.deltaY * 0.002)))
        view.x = localX - ((localX - view.x) / view.zoom) * scale
        view.y = localY - ((localY - view.y) / view.zoom) * scale
        view.zoom = scale
      } else {
        viewRef.current.x -= event.deltaX
        viewRef.current.y -= event.deltaY
      }
      setViewLabel(`${Math.round(viewRef.current.zoom * 100)}%`)
      scheduleDraw()
    }
    const keyDown = (event: KeyboardEvent): void => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return
      if (event.code === 'Space') {
        event.preventDefault()
        keysRef.current.space = true
        setTestStatus('Space：临时平移')
      }
      if (event.key === 'Alt') {
        event.preventDefault()
        keysRef.current.alt = true
        setTestStatus('Alt：临时吸色')
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedRef.current.size) {
          strokesRef.current = strokesRef.current.filter(
            (stroke) => !selectedRef.current.has(stroke.id)
          )
          selectedRef.current.clear()
          updateCounts()
          scheduleDraw()
        }
      }
    }
    const keyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') keysRef.current.space = false
      if (event.key === 'Alt') keysRef.current.alt = false
      setTestStatus(
        keysRef.current.space
          ? 'Space：临时平移'
          : keysRef.current.alt
            ? 'Alt：临时吸色'
            : '工具已恢复'
      )
    }
    const blur = (): void => {
      keysRef.current.space = false
      keysRef.current.alt = false
      dragRef.current = null
      setTestStatus('焦点丢失，已恢复默认工具')
      scheduleDraw()
    }
    const contextMenu = (event: MouseEvent): void => event.preventDefault()
    const pointerRawUpdate = (event: Event): void => pointerMove(event as PointerEvent)
    const resize = new ResizeObserver(scheduleDraw)
    resize.observe(host)
    canvas.addEventListener('pointerdown', pointerDown)
    canvas.addEventListener('pointermove', pointerMove)
    canvas.addEventListener('pointerrawupdate', pointerRawUpdate)
    canvas.addEventListener('pointerup', finish)
    canvas.addEventListener('pointercancel', finish)
    canvas.addEventListener('lostpointercapture', finish)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('contextmenu', contextMenu)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', blur)
    scheduleDraw()
    return () => {
      resize.disconnect()
      cancelAnimationFrame(frameRef.current)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerrawupdate', pointerRawUpdate)
      canvas.removeEventListener('pointerup', finish)
      canvas.removeEventListener('pointercancel', finish)
      canvas.removeEventListener('lostpointercapture', finish)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('contextmenu', contextMenu)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const clear = (): void => {
    strokesRef.current = []
    selectedRef.current.clear()
    dragRef.current = null
    setCounts({ strokes: 0, points: 0, selected: 0 })
    setRenderMs(0)
    setPressureRange('—')
    setTestStatus('画布已清空')
    redrawRef.current()
  }
  const stress = (amount: number): void => {
    const generated: Stroke[] = Array.from({ length: amount }, (_, index) => {
      const baseX = (index * 37) % 950,
        baseY = (index * 71) % 700
      return {
        id: idRef.current++,
        color: palette[index % palette.length],
        width: 2.5,
        points: Array.from({ length: 20 }, (_, point) => ({
          x: baseX + point * 3,
          y: baseY + Math.sin(point * 0.55 + index) * 12,
          pressure: 0.3 + (point % 7) / 12,
          time: point
        }))
      }
    })
    strokesRef.current = generated
    selectedRef.current.clear()
    setCounts({ strokes: amount, points: amount * 20, selected: 0 })
    setTestStatus(`已生成 ${amount} 条模拟笔迹；观察单帧重绘耗时`)
    forceMetricRef.current = true
    redrawRef.current()
  }
  const resetView = (): void => {
    viewRef.current = { x: 0, y: 0, zoom: 1 }
    setViewLabel('100%')
    redrawRef.current()
  }
  return (
    <section className="pen-poc" aria-label="数位板输入测试">
      <header className="pen-poc-header">
        <button className="back-link" onClick={onBack}>
          <ChevronLeft size={18} /> 返回笔记
        </button>
        <div>
          <h1>数位板输入测试</h1>
          <p>独立实验画布 · 不写入笔记</p>
        </div>
        <span>{testStatus}</span>
      </header>
      <div className="pen-poc-body">
        <div className="pen-poc-main">
          <div className="pen-poc-toolbar" role="toolbar" aria-label="输入测试工具">
            {(
              [
                ['pen', PenLine],
                ['eraser', Eraser],
                ['lasso', LassoSelect],
                ['hand', Hand]
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                className={tool === value ? 'active' : ''}
                aria-pressed={tool === value}
                onClick={() => setTool(value)}
              >
                <Icon size={17} /> {toolLabels[value]}
              </button>
            ))}
            <span className="pen-poc-tool-separator" />
            {palette.map((value) => (
              <button
                key={value}
                className={`pen-poc-color ${color === value ? 'active' : ''}`}
                aria-label={`墨色 ${value}`}
                onClick={() => setColor(value)}
              >
                <i style={{ background: value }} />
              </button>
            ))}
            <label>
              笔宽{' '}
              <input
                aria-label="笔宽"
                type="range"
                min="1"
                max="12"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />{' '}
              {width}
            </label>
          </div>
          <div className="pen-poc-canvas-host" ref={hostRef}>
            <canvas ref={canvasRef} aria-label="输入测试画布" />
          </div>
          <footer className="pen-poc-footer">
            <span>
              Space 平移 · Alt 吸取已有笔迹颜色 · Ctrl + 滚轮缩放 · 滚轮平移 · Delete 删除套索选中
            </span>
            <button onClick={resetView}>
              <RotateCcw size={14} /> {viewLabel}
            </button>
          </footer>
        </div>
        <aside className="pen-poc-diagnostics" aria-label="输入诊断">
          <h2>输入诊断</h2>
          <p>移动笔尖或按侧键，观察事件值</p>
          <div className="pen-poc-readout">
            {readout ? (
              <>
                <div>
                  <span>设备</span>
                  <strong>{readout.pointerType}</strong>
                </div>
                <div>
                  <span>事件 / 工具</span>
                  <strong>
                    {readout.type} / {toolLabels[readout.tool]}
                  </strong>
                </div>
                <div>
                  <span>pressure</span>
                  <strong>{readout.pressure.toFixed(3)}</strong>
                </div>
                <div>
                  <span>上次笔迹范围</span>
                  <strong>{pressureRange}</strong>
                </div>
                <div>
                  <span>button / buttons</span>
                  <strong>
                    {readout.button} / {readout.buttons}
                  </strong>
                </div>
                <div>
                  <span>tilt X / Y</span>
                  <strong>
                    {readout.tiltX}° / {readout.tiltY}°
                  </strong>
                </div>
                <div>
                  <span>twist</span>
                  <strong>{readout.twist}°</strong>
                </div>
                <div>
                  <span>合并采样</span>
                  <strong>{readout.coalesced}</strong>
                </div>
                <div>
                  <span>pointerId</span>
                  <strong>{readout.pointerId}</strong>
                </div>
              </>
            ) : (
              <span>尚未收到 Pointer Event</span>
            )}
          </div>
          <label className="pen-poc-setting">
            侧键临时工具{' '}
            <select
              aria-label="侧键临时工具"
              value={side}
              onChange={(event) => setSide(event.target.value as typeof side)}
            >
              <option value="none">仅记录事件</option>
              <option value="eraser">橡皮擦</option>
              <option value="lasso">套索</option>
            </select>
          </label>
          <label className="pen-poc-setting">
            轮廓方式
            <select
              aria-label="轮廓方式"
              value={renderer}
              onChange={(event) => setRenderer(event.target.value as typeof renderer)}
            >
              <option value="segments">线段基线</option>
              <option value="freehand">perfect-freehand</option>
            </select>
          </label>
          <label className="pen-poc-setting">
            <span>使用压感线宽</span>
            <input
              type="checkbox"
              checked={pressureWidth}
              onChange={(event) => setPressureWidth(event.target.checked)}
            />
          </label>
          <label className="pen-poc-setting">
            采样事件
            <select
              aria-label="采样事件"
              value={stream}
              onChange={(event) => setStream(event.target.value as typeof stream)}
            >
              <option value="move">pointermove</option>
              <option value="raw" disabled={!rawAvailable}>
                pointerrawupdate
              </option>
            </select>
          </label>
          <label className="pen-poc-setting">
            <span>使用合并采样</span>
            <input
              type="checkbox"
              checked={coalesced}
              onChange={(event) => setCoalesced(event.target.checked)}
            />
          </label>
          <label className="pen-poc-setting">
            <span>笔迹平滑</span>
            <input
              type="checkbox"
              checked={smoothing}
              onChange={(event) => setSmoothing(event.target.checked)}
            />
          </label>
          <div className="pen-poc-measure">
            <span>
              笔迹 {counts.strokes} 条 · 采样点 {counts.points}
            </span>
            <span>
              选中 {counts.selected} 条 · 单帧重绘 {renderMs.toFixed(1)} ms
            </span>
          </div>
          <div className="pen-poc-bench">
            <strong>性能样本</strong>
            <div>
              {[100, 1000, 5000].map((amount) => (
                <button key={amount} onClick={() => stress(amount)}>
                  {amount} 条
                </button>
              ))}
            </div>
            <button onClick={clear}>
              <Trash2 size={15} /> 清空
            </button>
          </div>
          <div className="pen-poc-event-log">
            <strong>最近事件</strong>
            {events.length ? (
              events.map((entry, index) => <code key={`${entry}-${index}`}>{entry}</code>)
            ) : (
              <small>等待笔或鼠标输入</small>
            )}
          </div>
        </aside>
      </div>
    </section>
  )
}
