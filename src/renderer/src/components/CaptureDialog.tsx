import { useRef, useState } from 'react'
import { ImagePlus, Pin } from 'lucide-react'
import type { CapturedScreen } from '../../../shared/editor'

type Rect = { x: number; y: number; width: number; height: number }
type Props = {
  screen: CapturedScreen
  onClose: () => void
  onResult: (mode: 'note' | 'pin', dataUrl: string) => Promise<void>
}

export default function CaptureDialog({ screen, onClose, onResult }: Props): React.JSX.Element {
  const imageRef = useRef<HTMLImageElement>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const point = (event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const bounds = imageRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
    }
  }
  const submit = async (mode: 'note' | 'pin'): Promise<void> => {
    if (!selection || !imageRef.current) return
    setBusy(true)
    try {
      const image = imageRef.current
      const sx = screen.width / image.clientWidth,
        sy = screen.height / image.clientHeight
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(selection.width * sx)
      canvas.height = Math.round(selection.height * sy)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法裁切截图')
      context.drawImage(
        image,
        selection.x * sx,
        selection.y * sy,
        selection.width * sx,
        selection.height * sy,
        0,
        0,
        canvas.width,
        canvas.height
      )
      await onResult(mode, canvas.toDataURL('image/png'))
      onClose()
    } catch (reason) {
      setError(`截图处理失败：${String(reason)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="editor-capture-backdrop" role="dialog" aria-modal="true" aria-label="区域截图">
      <div className="editor-capture-dialog">
        <header>
          <div>
            <strong>区域截图</strong>
            <small>{screen.label} · 拖动框选范围</small>
          </div>
          <button onClick={onClose} disabled={busy}>
            取消
          </button>
        </header>
        <div
          className="editor-capture-image"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            const current = point(event)
            startRef.current = current
            setSelection({ ...current, width: 0, height: 0 })
          }}
          onPointerMove={(event) => {
            const start = startRef.current
            if (!start) return
            const current = point(event)
            setSelection({
              x: Math.min(start.x, current.x),
              y: Math.min(start.y, current.y),
              width: Math.abs(current.x - start.x),
              height: Math.abs(current.y - start.y)
            })
          }}
          onPointerUp={() => {
            startRef.current = null
          }}
          onPointerCancel={() => {
            startRef.current = null
          }}
        >
          <img ref={imageRef} src={screen.dataUrl} alt="当前屏幕截图" draggable={false} />
          {selection && <div className="editor-capture-selection" style={selection} />}
        </div>
        <footer>
          <span role={error ? 'alert' : undefined}>{error || '选区至少 10 × 10 像素'}</span>
          <button
            disabled={busy || !selection || selection.width < 10 || selection.height < 10}
            onClick={() => void submit('pin')}
          >
            <Pin size={15} /> 贴到桌面
          </button>
          <button
            className="primary"
            disabled={busy || !selection || selection.width < 10 || selection.height < 10}
            onClick={() => void submit('note')}
          >
            <ImagePlus size={15} /> 贴入笔记
          </button>
        </footer>
      </div>
    </div>
  )
}
