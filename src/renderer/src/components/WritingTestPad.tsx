import { useRef, useState } from 'react'
import { InkInput } from '../editor/inkInput'
import { strokePath } from '../editor/ink'
import type { Preferences } from '../editor/preferences'

export default function WritingTestPad({ preferences }: { preferences: Preferences }): React.JSX.Element {
  const drag = useRef<{ id: number; input: InkInput; stylus: boolean } | null>(null)
  const [committed, setCommitted] = useState<string[]>([])
  const [preview, setPreview] = useState('')
  const [input, setInput] = useState({ type: '', pressure: 0, buttons: 0 })
  const sample = (event: React.PointerEvent<SVGSVGElement>, stylus: boolean): { x: number; y: number; pressure: number; time: number } => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, pressure: stylus ? event.pressure : 0.5, time: event.timeStamp }
  }
  const renderPath = (points: ReturnType<InkInput['preview']>, stylus: boolean): string => strokePath(points, {
    brush: 'pen', width: preferences.penWidth, pressureSensitive: preferences.pressure, penStyle: preferences.penStyle,
    pressureCurve: preferences.pressureCurve, inkVersion: 3, pressureInput: stylus ? 'pen' : 'fixed'
  })
  const finish = (event: React.PointerEvent<SVGSVGElement>, cancelled = false): void => {
    const current = drag.current
    if (!current || current.id !== event.pointerId) return
    drag.current = null
    setCommitted((items) => [...items.slice(-99), renderPath(current.input.finish(cancelled ? undefined : sample(event, current.stylus)), current.stylus)])
    setPreview('')
    setInput({ type: event.pointerType, pressure: 0, buttons: 0 })
  }
  return <div className="writing-test">
    <svg role="img" aria-label="书写测试画布" onPointerDown={(event) => {
      setInput({ type: event.pointerType, pressure: event.pressure, buttons: event.buttons })
      if (drag.current || event.button !== 0 || (preferences.device === 'pen' && event.pointerType !== 'pen') ||
          (preferences.ignoreTouch && event.pointerType === 'touch')) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const stylus = event.pointerType === 'pen' && preferences.device !== 'mouse'
      const input = new InkInput(sample(event, stylus), 1, preferences.stability, stylus)
      drag.current = { id: event.pointerId, input, stylus }
      setPreview(renderPath(input.preview(), stylus))
    }} onPointerMove={(event) => {
      setInput({ type: event.pointerType, pressure: event.pressure, buttons: event.buttons })
      const current = drag.current
      if (!current || current.id !== event.pointerId) return
      current.input.add(sample(event, current.stylus))
      setPreview(renderPath(current.input.preview(), current.stylus))
    }} onPointerUp={finish} onLostPointerCapture={(event) => finish(event, true)}>
      {committed.map((path, index) => <path key={index} fill="currentColor" d={path} />)}
      {preview && <path fill="currentColor" d={preview} />}
    </svg>
    <div className="writing-test-status">
      <span>{({ pen: '手写笔', mouse: '鼠标', touch: '触控' } as Record<string, string>)[input.type] ?? '等待输入'} · 压力 {Math.round(input.pressure * 100)}% · 按键 {input.buttons}</span>
      <meter aria-label="实时压力" min={0} max={1} value={input.pressure} />
      <button onClick={() => { setCommitted([]); setPreview('') }}>清空</button>
    </div>
  </div>
}
