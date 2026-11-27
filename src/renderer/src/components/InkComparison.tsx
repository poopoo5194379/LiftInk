import * as Dialog from '@radix-ui/react-dialog'
import { useMemo, useRef, useState } from 'react'
import { strokePath } from '../editor/ink'
import { parseInkTrace, replayInkTrace, type InkTrace } from '../editor/inkTrace'

function makeComparison(trace: InkTrace): { viewBox: string; raw: string; fixed: string; old: string; current: string } {
  const points = replayInkTrace(trace)
  const brush = { ...trace.brush, pressureInput: trace.stylus ? 'pen' : 'fixed' } as const
  const bounds = [...trace.samples, ...(trace.release ? [trace.release] : [])]
  const xs = bounds.map(({ x }) => x)
  const ys = bounds.map(({ y }) => y)
  const margin = Math.max(brush.width, 6)
  const left = Math.min(...xs) - margin
  const top = Math.min(...ys) - margin
  const width = Math.max(...xs) - left + margin
  const height = Math.max(...ys) - top + margin
  return {
    viewBox: `${left} ${top} ${width} ${height}`,
    raw: trace.samples.map(({ x, y }) => `${x},${y}`).join(' '),
    fixed: strokePath(trace.samples, { ...brush, pressureSensitive: false, inkVersion: 3 }, false),
    old: strokePath(points, { ...brush, inkVersion: 2 }),
    current: strokePath(points, { ...brush, inkVersion: 3 })
  }
}

export default function InkComparison({ initial, container, onClose }: {
  initial: InkTrace | null
  container?: HTMLElement | null
  onClose: () => void
}): React.JSX.Element {
  const [trace, setTrace] = useState(initial)
  const [status, setStatus] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const comparison = useMemo(() => trace ? makeComparison(trace) : null, [trace])
  const load = async (file: File): Promise<void> => {
    try {
      if (file.size > 2_000_000) throw new Error('采样文件超过 2 MB')
      setTrace(parseInkTrace(await file.text()))
      setStatus('已载入采样')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法载入采样')
    }
  }
  const save = async (): Promise<void> => {
    if (!trace) return
    try {
      // The sample format contains only ASCII keys and numeric values.
      const result = await window.liftInk.saveExport('json', 'LiftInk-ink-trace', btoa(JSON.stringify(trace)))
      if (result) setStatus('已保存采样')
    } catch {
      setStatus('无法保存采样')
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content ink-comparison-dialog">
          <Dialog.Title>笔迹对照</Dialog.Title>
          <Dialog.Description>用同一条采样对照四种结果。文件包含这一笔的坐标、时间、压力和笔刷设置。</Dialog.Description>
          {trace && comparison ? (
            <div className="ink-comparison-grid">
              {(['原始轨迹', '等宽无修饰', '旧版轮廓', '新版轮廓'] as const).map((label, index) => (
                <figure key={label}>
                  <figcaption>{label}</figcaption>
                  <svg aria-label={label} role="img" viewBox={comparison.viewBox}>
                    {index === 0 ? (
                      <>
                        <polyline points={comparison.raw} stroke="#706093" fill="none" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        <circle cx={trace.samples[0].x} cy={trace.samples[0].y} r="1.2" fill="#706093" />
                        {trace.release && <circle cx={trace.release.x} cy={trace.release.y} r="1.2" fill="#ad5634" />}
                      </>
                    ) : <path d={[comparison.fixed, comparison.old, comparison.current][index - 1]} fill="#202124" />}
                  </svg>
                </figure>
              ))}
            </div>
          ) : <p>在纸面上写一笔，或载入之前保存的采样。</p>}
          {trace && <small>{trace.samples.length} 个落笔采样 · {trace.stylus ? '数位笔' : '等宽指针'}</small>}
          <div className="dialog-options">
            <input ref={input} type="file" accept=".json,application/json" hidden onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void load(file)
            }} />
            <button type="button" onClick={() => input.current?.click()}>载入采样</button>
            <button type="button" disabled={!trace} onClick={() => void save()}>保存采样</button>
            <Dialog.Close asChild><button type="button">关闭</button></Dialog.Close>
          </div>
          {status && <p role="status">{status}</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
