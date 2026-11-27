import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type ButtonProps = React.ComponentPropsWithRef<'button'> & {
  help: string
  label?: string
}

export function BrushWidthControl({ value, min, max, label = '笔宽', logarithmic = false, step = 0.1, onChange }: {
  value: number; min: number; max: number; label?: string; logarithmic?: boolean; step?: number
  onChange: (width: number) => void
}): React.JSX.Element {
  const [input, setInput] = useState<{ value: number; text: string }>()
  const scaled = logarithmic && max > min
  const sliderValue = scaled ? Math.round(100 * Math.log(value / min) / Math.log(max / min)) : value
  return <div className="editor-brush-settings">
    <label>{label} <output>{value} px</output><input aria-label={`${label}滑块`} aria-valuetext={`${value} 像素`}
      type="range" min={scaled ? 0 : min} max={scaled ? 100 : max} step={scaled ? 1 : step}
      value={sliderValue} onChange={(event) => {
        const position = event.target.valueAsNumber
        onChange(scaled ? Math.round(min * (max / min) ** (position / 100)) : position)
        setInput(undefined)
      }} /></label>
    <label>精确{label} <input aria-label={`精确${label}`} type="number" min={min} max={max} step={step}
      value={input?.value === value ? input.text : value}
      onChange={(event) => {
        const width = event.target.valueAsNumber
        if (Number.isFinite(width) && width >= min && width <= max) {
          const next = step === 1 ? Math.round(width) : width
          onChange(next)
          setInput({ value: next, text: event.target.value })
        } else setInput({ value, text: event.target.value })
      }}
      onBlur={() => setInput(undefined)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
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
