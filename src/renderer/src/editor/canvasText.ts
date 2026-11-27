import type { CanvasTextFont, CanvasTextRange, TextElement } from '../../../shared/editor'

type InlineStyle = Pick<CanvasTextRange, 'font' | 'color'>
type Inline = InlineStyle & { text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean }
export const canvasTextFonts: Record<CanvasTextFont, string> = {
  sans: 'Microsoft YaHei UI, PingFang SC, sans-serif',
  serif: 'Georgia, SimSun, Songti SC, serif',
  mono: 'Consolas, Menlo, monospace'
}

function compact(ranges: CanvasTextRange[]): CanvasTextRange[] {
  const result: CanvasTextRange[] = []
  for (const range of ranges) {
    if (range.from >= range.to || (!range.font && !range.color)) continue
    const last = result.at(-1)
    if (last?.to === range.from && last.font === range.font && last.color === range.color) last.to = range.to
    else result.push({ ...range })
  }
  return result
}

export function styleCanvasText(ranges: CanvasTextRange[], from: number, to: number, style: InlineStyle): CanvasTextRange[] {
  const edges = [...new Set([from, to, ...ranges.flatMap((range) => [range.from, range.to])])].sort((a, b) => a - b)
  let i = 0
  return compact(edges.slice(0, -1).map((start, index) => {
    while (ranges[i]?.to <= start) i++
    const previous = ranges[i]?.from <= start ? ranges[i] : undefined
    return { font: previous?.font, color: previous?.color, ...(start >= from && start < to ? style : {}), from: start, to: edges[index + 1] }
  }))
}

export function replaceCanvasText(ranges: CanvasTextRange[], from: number, to: number, length: number): CanvasTextRange[] {
  const delta = length - (to - from)
  const inherited = ranges.find((range) => range.from <= from && range.to >= to &&
    (from !== to || (range.from < from && range.to > from)))
  return compact([
    ...ranges.filter((range) => range.from < from).map((range) => ({ ...range, to: Math.min(range.to, from) })),
    ...(inherited && length ? [{ ...inherited, from, to: from + length }] : []),
    ...ranges.filter((range) => range.to > to).map((range) => ({ ...range, from: Math.max(range.from, to) + delta, to: range.to + delta }))
  ])
}

export function remapCanvasText(ranges: CanvasTextRange[], before: string, after: string): CanvasTextRange[] {
  if (!ranges.length || before === after) return ranges
  let from = 0, end = 0
  while (from < before.length && from < after.length && before[from] === after[from]) from++
  while (end < before.length - from && end < after.length - from && before.at(-1 - end) === after.at(-1 - end)) end++
  return replaceCanvasText(ranges, from, before.length - end, after.length - from - end)
}

export function canvasTextLines({ text, format, styles = [] }: Pick<TextElement, 'text' | 'format' | 'styles'>): Inline[][] {
  let base = 0, i = 0
  return text.split(/\r?\n/).map((line) => {
    const parts: Inline[] = []
    const emit = (value: string, offset: number, marks: Omit<Inline, 'text'> = {}): void => {
      let start = base + offset
      const end = start + value.length
      while (start < end) {
        while (styles[i]?.to <= start) i++
        const range = styles[i]
        const inside = range && range.from <= start
        const stop = Math.min(end, inside ? range.to : range?.from ?? end)
        parts.push({ ...marks, font: inside ? range.font : undefined, color: inside ? range.color : undefined, text: value.slice(start - base - offset, stop - base - offset) })
        start = stop
      }
    }
    let offset = 0
    for (const match of format === 'markdown' ? line.matchAll(/\\[\\*~`]|(\*\*\*|\*\*|\*|~~|`)(?=\S)((?:\\.|[^\\])*?\S)\1/g) : []) {
      emit(line.slice(offset, match.index), offset)
      const [, mark, content] = match
      if (mark) {
        const start = match.index + mark.length
        const marks = { bold: mark === '**' || mark === '***', italic: mark === '*' || mark === '***', strike: mark === '~~', code: mark === '`' }
        let cursor = 0
        if (!marks.code) for (const escaped of content.matchAll(/\\([\\*~`])/g)) {
          emit(content.slice(cursor, escaped.index), start + cursor, marks)
          emit(escaped[1], start + escaped.index + 1, marks)
          cursor = escaped.index + 2
        }
        emit(content.slice(cursor), start + cursor, marks)
      } else emit(match[0].slice(1), match.index + 1)
      offset = match.index + match[0].length
    }
    emit(line.slice(offset), offset)
    base += line.length + (text[base + line.length] === '\r' ? 2 : 1)
    return parts
  })
}

export function canvasTextStyle(run: Inline, font: CanvasTextFont = 'sans'): React.CSSProperties {
  return {
    fontFamily: canvasTextFonts[run.font ?? (run.code ? 'mono' : font)],
    color: run.color,
    fontWeight: run.bold ? 700 : undefined,
    fontStyle: run.italic ? 'italic' : undefined,
    textDecoration: run.strike ? 'line-through' : undefined
  }
}

export function plainCanvasText(element: TextElement): string {
  return canvasTextLines(element).map((line) => line.map((run) => run.text).join('')).join('\n')
}

let metrics: CanvasRenderingContext2D | null | undefined
function measureRun(element: TextElement, run: Inline, text = run.text): number {
  metrics ??= document.createElement('canvas').getContext('2d')
  const style = canvasTextStyle(run, element.font)
  if (metrics) metrics.font = `${style.fontStyle ?? 'normal'} ${style.fontWeight ?? 400} ${element.fontSize}px ${style.fontFamily}`
  return metrics?.measureText(text).width ?? text.length * element.fontSize
}

export function measureCanvasText(element: TextElement): number {
  return Math.min(20000, Math.max(24, ...canvasTextLines(element).map((line) => line.reduce((width, run) => width + measureRun(element, run), 8))))
}

type Layout = { x: number; width: number; height: number; lines: Inline[][]; overflow: boolean }
const layouts = new WeakMap<TextElement, { pageWidth: number; layout: Layout }>()
export function layoutCanvasText(element: TextElement, pageWidth: number): Layout {
  const cached = layouts.get(element)
  if (cached?.pageWidth === pageWidth) return cached.layout
  const x = element.x
  const width = element.height === undefined ? Math.min(element.width, pageWidth) : element.width
  const available = Math.max(8, width - 4)
  const lines: Inline[][] = []
  for (const source of canvasTextLines(element)) {
    const natural = source.reduce((width, run) => width + measureRun(element, run), 0)
    if (natural <= available) {
      lines.push(source)
      continue
    }
    let line: Inline[] = [], used = 0
    const flush = (): void => { lines.push(line); line = []; used = 0 }
    for (const run of source) {
      let segment: Inline | undefined
      const append = (text: string, advance: number): void => {
        if (segment && line.at(-1) === segment) segment.text += text
        else { segment = { ...run, text }; line.push(segment) }
        used += advance
      }
      for (const token of run.text.match(/\s+|[\p{Script=Latin}\p{N}_-]+|./gu) ?? []) {
        const advance = measureRun(element, run, token)
        if (used && used + advance > available && !/^\s+$/u.test(token)) flush()
        if (advance <= available || /^\s+$/u.test(token)) append(token, advance)
        else for (const char of token) {
          const size = measureRun(element, run, char)
          if (used && used + size > available) flush()
          append(char, size)
        }
      }
    }
    flush()
  }
  const lineHeight = element.fontSize * 1.5
  const height = element.height ?? Math.min(20000, lines.length * lineHeight)
  const completeLines = Math.floor((height + element.fontSize * 0.25) / lineHeight)
  const layout = { x, width, height, lines: lines.slice(0, Math.max(1, completeLines)), overflow: completeLines < lines.length }
  layouts.set(element, { pageWidth, layout })
  return layout
}

export function positionCanvasText(element: TextElement, sourceWidth: number, page: { width: number; height: number }, dx: number, dy: number): TextElement {
  const { width, height } = layoutCanvasText(element, sourceWidth)
  const x = Math.max(0, Math.min(page.width - Math.min(width, page.width, 32), element.x + dx))
  const top = Math.max(0, Math.min(page.height - Math.min(height, page.height, 24), element.y - element.fontSize + dy))
  return { ...element, x, y: top + element.fontSize, width }
}
