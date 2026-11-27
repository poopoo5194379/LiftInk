import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ButtonProps = React.ComponentPropsWithRef<'button'> & {
  help: string
  label?: string
}

export function BrushWidthControl({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (width: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  return <div className="editor-brush-settings">
    <label>笔宽 <output>{value} px</output><input aria-label="笔宽滑块" type="range" min={min} max={max} step={0.1}
      value={value} onChange={(event) => { onChange(event.target.valueAsNumber); setDraft(event.target.value) }} /></label>
    <label>精确笔宽 <input aria-label="精确笔宽" type="number" min={min} max={max} step={0.1} value={draft}
      onChange={(event) => {
        const width = event.target.valueAsNumber
        setDraft(event.target.value)
        if (Number.isFinite(width) && width >= min && width <= max) onChange(width)
      }}
      onBlur={() => setDraft(String(value))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
  </div>
}

export function EditorButton({ help, label, ...props }: ButtonProps): React.JSX.Element {
  const id = useId()
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const show = (element: HTMLElement): void => {
    const bounds = element.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 232)),
      top: bounds.bottom + 6
    })
  }
  return (
    <span
      className="editor-control"
      onPointerEnter={(event) => show(event.currentTarget)}
      onPointerLeave={() => setPosition(null)}
    >
      <button
        type="button"
        {...props}
        aria-describedby={position ? id : undefined}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget)
        }}
        onBlur={() => setPosition(null)}
        onClick={(event) => {
          setPosition(null)
          props.onClick?.(event)
        }}
      />
      {position &&
        createPortal(
          <div className="editor-tooltip" id={id} role="tooltip" style={position}>
            <strong>{label ?? props['aria-label'] ?? props.children}</strong>
            <span>{help}</span>
          </div>,
          document.fullscreenElement ?? document.body
        )}
    </span>
  )
}

export function ToolPopover({
  anchor,
  label,
  onClose,
  children
}: {
  anchor: HTMLButtonElement
  label: string
  onClose: () => void
  children: React.ReactNode
}): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const bounds = anchor.getBoundingClientRect()
  useEffect(() => {
    const closeOnPointer = (event: PointerEvent): void => {
      if (
        !(event.target instanceof Node) ||
        panel.current?.contains(event.target) ||
        anchor.contains(event.target)
      )
        return
      onClose()
    }
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      onClose()
      anchor.focus()
    }
    const closeOnScroll = (event: Event): void => {
      if (event.target instanceof Element && event.target.contains(anchor)) onClose()
    }
    window.addEventListener('pointerdown', closeOnPointer)
    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', closeOnPointer)
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('scroll', closeOnScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[aria-pressed="true"], button, input')?.focus()
  }, [anchor])
  return createPortal(
    <div
      ref={panel}
      className="editor-tool-popover"
      role="dialog"
      aria-label={label}
      style={{
        left: Math.max(8, Math.min(bounds.left, window.innerWidth - 248)),
        top: bounds.bottom + 8
      }}
    >
      <strong>{label}</strong>
      {children}
    </div>,
    document.fullscreenElement ?? document.body
  )
}
