import type { InkElement, InkPoint, PageElement } from '../../../shared/editor'
import { layoutCanvasText } from './canvasText'

export function distanceToSegment(x: number, y: number, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}

export function splitInk(stroke: InkElement, eraser: InkPoint[], radius: number): InkElement[] {
  if (!eraser.length) return [stroke]
  const fragments: InkPoint[][] = []
  let current: InkPoint[] = []
  let cutAny = false
  const points: InkPoint[] = []
  stroke.points.forEach((point, index) => {
    const previous = stroke.points[index - 1]
    if (previous) {
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 3))
      for (let step = 1; step < steps; step++) {
        const t = step / steps
        points.push({ x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t, pressure: previous.pressure + (point.pressure - previous.pressure) * t })
      }
    }
    points.push(point)
  })
  for (const point of points) {
    const cut = eraser.some((entry, index) => index === 0
      ? Math.hypot(point.x - entry.x, point.y - entry.y) <= radius
      : distanceToSegment(point.x, point.y, eraser[index - 1], entry) <= radius)
    if (cut) {
      cutAny = true
      if (current.length > 1) fragments.push(current)
      current = []
    } else current.push(point)
  }
  if (current.length > 1) fragments.push(current)
  if (!cutAny) return [stroke]
  return fragments.map((part, index) => ({ ...stroke, id: index === 0 ? stroke.id : crypto.randomUUID(), points: part }))
}

export function insidePolygon(point: InkPoint, polygon: InkPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function elementBounds(element: PageElement, pageWidth?: number): { x: number; y: number; width: number; height: number } {
  if (element.kind === 'ink') {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const point of element.points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y) }
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
  }
  if (element.kind === 'text') {
    const layout = pageWidth === undefined ? undefined : layoutCanvasText(element, pageWidth)
    return { x: layout?.x ?? element.x, y: element.y - element.fontSize, width: layout?.width ?? element.width, height: layout?.height ?? element.height ?? element.fontSize * 1.5 }
  }
  return { x: Math.min(element.x, element.x + element.width), y: Math.min(element.y, element.y + element.height), width: Math.abs(element.width), height: Math.abs(element.height) }
}

export function moveElement<T extends PageElement>(element: T, dx: number, dy: number): T {
  if (element.kind === 'ink') return { ...element, points: element.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) } as T
  return { ...element, x: element.x + dx, y: element.y + dy }
}

export function scaleElement<T extends PageElement>(element: T, origin: InkPoint, scale: number): T {
  if (element.kind === 'ink') return { ...element, points: element.points.map((point) => ({ ...point, x: origin.x + (point.x - origin.x) * scale, y: origin.y + (point.y - origin.y) * scale })), width: element.width * scale } as T
  if (element.kind === 'text') return { ...element, x: origin.x + (element.x - origin.x) * scale, y: origin.y + (element.y - origin.y) * scale, width: Math.min(20000, element.width * scale), height: element.height === undefined ? undefined : Math.min(20000, element.height * scale), fontSize: Math.max(8, Math.min(160, element.fontSize * scale)) } as T
  return { ...element, x: origin.x + (element.x - origin.x) * scale, y: origin.y + (element.y - origin.y) * scale, width: element.width * scale, height: element.height * scale } as T
}
