import { useRef, useState } from 'react'
import { ImagePlus, Pin } from 'lucide-react'
import type { CapturedScreen } from '../../../shared/editor'

type Point = { x: number; y: number }
type Rect = Point & { width: number; height: number }
type Props = {
  screen: Pick<CapturedScreen, 'dataUrl' | 'label'>
  purpose?: 'capture' | 'crop' | 'excerpt'
  onClose: () => void
  onResult: (mode: 'note' | 'pin', dataUrl: string, fraction: Rect) => Promise<void>
}

export default function CaptureDialog({
  screen,
  purpose = 'capture',
  onClose,
  onResult
}: Props): React.JSX.Element {
  const cropping = purpose !== 'capture'
  const title = purpose === 'excerpt' ? '框选摘录' : cropping ? '裁剪图片' : '区域截图'
  const imageRef = useRef<HTMLImageElement>(null)
  const dragRef = useRef<{ id: number; start: Point } | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const outputSize = selection &&
    sourceSize && {
      width: Math.round(selection.width * sourceSize.width),
      height: Math.round(selection.height * sourceSize.height)
    }
  const minSize = cropping ? 1 : 10
  const canSubmit =
    !busy && !!outputSize && outputSize.width >= minSize && outputSize.height >= minSize
  const point = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
    }
  }
  const updateSelection = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (drag?.id !== event.pointerId) return
    const current = point(event)
    setSelection({
      x: Math.min(drag.start.x, current.x),
      y: Math.min(drag.start.y, current.y),
      width: Math.abs(current.x - drag.start.x),
      height: Math.abs(current.y - drag.start.y)
    })
  }
  const submit = async (mode: 'note' | 'pin'): Promise<void> => {
    const image = imageRef.current
    if (!canSubmit || !selection || !outputSize || !image) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = outputSize.width
      canvas.height = outputSize.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法生成选区图片')
      context.drawImage(
        image,
        selection.x * image.naturalWidth,
        selection.y * image.naturalHeight,
        selection.width * image.naturalWidth,
        selection.height * image.naturalHeight,
        0,
        0,
        canvas.width,
        canvas.height
      )
      await onResult(mode, canvas.toDataURL('image/png'), selection)
      onClose()
    } catch (reason) {
      setError(`${title}失败：${String(reason)}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="editor-capture-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="editor-capture-dialog">
        <header>
          <div>
            <strong>{title}</strong>
            <small>{cropping ? '拖动框选要保留的部分' : `${screen.label} · 拖动框选范围`}</small>
          </div>
          <button autoFocus onClick={onClose} disabled={busy}>
            取消
          </button>
        </header>
        <div
          className="editor-capture-image"
          onPointerDown={(event) => {
            if (busy || !sourceSize || event.button !== 0 || dragRef.current) return
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            const current = point(event)
            dragRef.current = { id: event.pointerId, start: current }
            setError('')
            setSelection({ ...current, width: 0, height: 0 })
          }}
          onPointerMove={updateSelection}
          onPointerUp={(event) => {
            if (dragRef.current?.id !== event.pointerId) return
            updateSelection(event)
            dragRef.current = null
          }}
          onLostPointerCapture={(event) => {
            if (dragRef.current?.id !== event.pointerId) return
            dragRef.current = null
            setSelection(null)
          }}
        >
          <img
            ref={imageRef}
            src={screen.dataUrl}
            alt={cropping ? '待裁剪图片' : '当前屏幕截图'}
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget
              setSourceSize({ width: naturalWidth, height: naturalHeight })
            }}
          />
          {selection && selection.width > 0 && selection.height > 0 && (
            <div
              aria-hidden="true"
              className="editor-capture-selection"
              style={{
                left: `${selection.x * 100}%`,
                top: `${selection.y * 100}%`,
                width: `${selection.width * 100}%`,
                height: `${selection.height * 100}%`
              }}
            />
          )}
        </div>
        <footer>
          <span role={error ? 'alert' : undefined}>
            {error ||
              (outputSize?.width && outputSize.height
                ? `${outputSize.width} × ${outputSize.height} 像素 · 可拖动重选`
                : '拖动框选，框内为保留区域')}
          </span>
          {!cropping && (
            <button disabled={!canSubmit} onClick={() => void submit('pin')}>
              <Pin size={15} /> 贴到桌面
            </button>
          )}
          <button className="primary" disabled={!canSubmit} onClick={() => void submit('note')}>
            {cropping ? (
              purpose === 'excerpt' ? '插入摘录' : '应用裁剪'
            ) : (
              <>
                <ImagePlus size={15} /> 贴入笔记
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}
