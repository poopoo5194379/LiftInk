import getStroke from 'perfect-freehand'
import type { InkElement, InkPoint, NotePage, PageElement, PenStyle } from '../../../shared/editor'
import { nibOutline, smoothNibOutline } from './inkGeometry'
import { strokeDiameters } from './inkPressure'

export const penStyles: Record<PenStyle, { name: string; help: string; thinning: number; size: number }> = {
  ballpoint: { name: '圆珠笔', help: '线宽稳定，适合密集手写。', thinning: 0, size: 0.75 },
  fountain: { name: '钢笔', help: '轻柔的粗细变化，适合日常笔记。', thinning: 0.34, size: 1 },
  brush: { name: '软头笔', help: '笔压带来更明显的提按变化。', thinning: 0.72, size: 1.3 },
  fineliner: { name: '针管笔', help: '均匀细线，适合小字和草图。', thinning: 0, size: 0.5 }
}

export type StrokeBrush = Pick<InkElement, 'brush' | 'width' | 'pressureSensitive' | 'penStyle' | 'stability' | 'pressureCurve' | 'inkVersion' | 'pressureInput'>

export function isHighlighter(element: PageElement): boolean {
  return element.kind === 'ink' && (element.brush === 'highlighter' || (element.brush === undefined && element.width > 10))
}

export function pagePaintBand(element: PageElement): 'image' | 'highlighter' | 'foreground' {
  return element.kind === 'image' ? 'image' : isHighlighter(element) ? 'highlighter' : 'foreground'
}

export function orderedElements(elements: PageElement[]): PageElement[] {
  const bands = { image: [] as PageElement[], highlighter: [] as PageElement[], foreground: [] as PageElement[] }
  for (const element of elements) bands[pagePaintBand(element)].push(element)
  return [...bands.image, ...bands.highlighter, ...bands.foreground]
}

export function multiplyHighlighter(page: NotePage): boolean {
  // Multiply retains PDF detail but vanishes on black pixels. Use a translucent overlay on picture pages.
  if (page.backgroundAssetId && !page.sourcePdfId) return false
  return !page.elements.some((element) => element.kind === 'image' &&
    page.layers?.find((layer) => layer.id === (element.layerId ?? 'base'))?.visible !== false)
}

export function strokePath(points: InkPoint[], brush: StrokeBrush, smoothEdges = true): string {
  if (!points.length) return ''
  const preset = brush.penStyle && penStyles[brush.penStyle]
  const size = brush.width * (preset ? preset.size : 1)
  if (brush.inkVersion === 3) {
    const influence = brush.pressureSensitive === false || brush.pressureInput !== 'pen'
      ? 0 : Math.min(0.6, preset?.thinning ?? 0.28)
    const diameters = strokeDiameters(points, size, influence, brush.pressureCurve ?? 1)
    return smoothEdges ? smoothNibOutline(points, diameters) : nibOutline(points, diameters)
  }

  const strength = brush.stability ?? 0
  let pressure = points[0].pressure
  const samples = brush.pressureCurve === undefined
    ? points
    : points.map((point) => {
        pressure += (point.pressure - pressure) * 0.45
        return { ...point, pressure: Math.pow(pressure, brush.pressureCurve!) }
      })
  const outline = getStroke(samples, {
    size,
    thinning: brush.pressureSensitive === false ? 0 : (preset ? preset.thinning : 0.65),
    smoothing: 0.5 + strength * 0.25,
    streamline: brush.inkVersion === 2 ? 0.12 : 0.45 + strength * 0.42,
    simulatePressure: false,
    last: brush.stability !== undefined
  })
  if (!outline.length) return ''
  if (brush.inkVersion !== 2) return `M${outline.map(([x, y]) => `${x} ${y}`).join('L')}Z`

  const coordinate = (x: number, y: number): string => `${x.toFixed(2)} ${y.toFixed(2)}`
  const midpoint = ([x, y]: number[], [nextX, nextY]: number[]): string =>
    coordinate((x + nextX) / 2, (y + nextY) / 2)
  const curves = outline.map(([x, y], index) =>
    `Q${coordinate(x, y)} ${midpoint(outline[index], outline[(index + 1) % outline.length])}`
  )
  return `M${midpoint(outline.at(-1)!, outline[0])}${curves.join('')}Z`
}

export function straightLinePoints(points: InkPoint[]): InkPoint[] {
  if (points.length < 2) return points
  const first = points[0]
  const last = points.at(-1)!
  const pressure = (first.pressure + last.pressure) / 2
  return [{ ...first, pressure }, { ...last, pressure }]
}

export function inkOpacity(element: Pick<InkElement, 'brush' | 'width'>): number {
  if (element.brush === 'highlighter') return 0.52
  return element.brush === undefined && element.width > 10 ? 0.55 : 1
}

export function isMeaningfulInk(points: InkPoint[], stylus: boolean): boolean {
  // Keep deliberate dots and light strokes, but discard isolated contact noise.
  return !stylus || points.some((point) => point.pressure >= 0.055) || points.some((point) =>
    Math.hypot(point.x - points[0].x, point.y - points[0].y) >= 2.5
  )
}
