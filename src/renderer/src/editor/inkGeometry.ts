import type { InkPoint } from '../../../shared/editor'

const number = (value: number): string => value.toFixed(3)
const point = (x: number, y: number): string => `${number(x)} ${number(y)}`

type Vector = { x: number; y: number }

const delta = (from: Vector, to: Vector): Vector => ({ x: to.x - from.x, y: to.y - from.y })
const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y
const length = (vector: Vector): number => Math.hypot(vector.x, vector.y)
const unit = (vector: Vector): Vector => {
  const magnitude = length(vector)
  return magnitude > 0 ? { x: vector.x / magnitude, y: vector.y / magnitude } : vector
}
const offset = (from: Vector, direction: Vector, amount: number): Vector =>
  ({ x: from.x + direction.x * amount, y: from.y + direction.y * amount })
const bisect = (before: Vector, after: Vector): Vector =>
  unit({ x: before.x + after.x, y: before.y + after.y })
const serialize = ({ x, y }: Vector): string => point(x, y)

/**
 * Sweep a circular nib along the centerline. All contours have the same winding
 * and are filled together, so overlaps at a tight turn cannot punch holes or darken.
 */
export function nibOutline(points: InkPoint[], diameters: number[]): string {
  const contours: string[] = []
  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i]
    const radius = diameters[i] / 2
    const right = point(x + radius, y)
    const left = point(x - radius, y)
    const arc = `A${number(radius)} ${number(radius)} 0 0 1 `
    contours.push(`M${right}${arc}${left}${arc}${right}Z`)
    if (i === 0) continue

    const previous = points[i - 1]
    const previousRadius = diameters[i - 1] / 2
    const dx = x - previous.x
    const dy = y - previous.y
    const length = Math.hypot(dx, dy)
    const difference = previousRadius - radius
    // The larger circle contains the entire span when no external tangent exists.
    if (length <= Math.abs(difference)) continue

    const ux = dx / length
    const uy = dy / length
    const slope = difference / length
    const normal = Math.sqrt(1 - slope * slope)
    const ax = ux * slope + uy * normal
    const ay = uy * slope - ux * normal
    const bx = ux * slope - uy * normal
    const by = uy * slope + ux * normal
    contours.push(
      `M${point(previous.x + ax * previousRadius, previous.y + ay * previousRadius)}` +
      `L${point(x + ax * radius, y + ay * radius)}` +
      `L${point(x + bx * radius, y + by * radius)}` +
      `L${point(previous.x + bx * previousRadius, previous.y + by * previousRadius)}Z`
    )
  }
  return contours.join('')
}

const edgeTaps = [
  { distance: 0.9, weight: 0.27 },
  { distance: 1.8, weight: 0.26 },
  { distance: 2.7, weight: 0.22 },
  { distance: 3.6, weight: 0.16 },
  { distance: 4.5, weight: 0.09 }
]

function railAt(rail: Vector[], distanceAlong: number[], target: number): Vector {
  let low = 0
  let high = distanceAlong.length - 1
  while (high - low > 1) {
    const middle = (low + high) >>> 1
    if (distanceAlong[middle] <= target) low = middle
    else high = middle
  }
  const span = distanceAlong[high] - distanceAlong[low]
  if (span <= 0) return rail[low]
  return offset(rail[low], delta(rail[low], rail[high]), (target - distanceAlong[low]) / span)
}

function makeRail(
  points: InkPoint[],
  radii: number[],
  headings: Vector[],
  distanceAlong: number[],
  side: number
): Vector[] {
  const totalLength = distanceAlong.at(-1)!
  const normals = points.map((_, i) => {
    let heading = i === 0 ? headings[0] : i === points.length - 1
      ? headings[i - 1] : bisect(headings[i - 1], headings[i])
    const center = distanceAlong[i]
    const reach = Math.min(2.4, center, totalLength - center)
    if (reach > 0) {
      const before = railAt(points, distanceAlong, center - reach)
      const after = railAt(points, distanceAlong, center + reach)
      const direction = unit(delta(before, after))
      if (dot(heading, direction) > 0.7) heading = direction
    }
    return { x: heading.y * side, y: -heading.x * side }
  })
  const rail = points.map((center, i) => offset(center, normals[i], radii[i]))
  return rail.map((knot, i) => {
    if (i === 0 || i === rail.length - 1) return knot

    const center = distanceAlong[i]
    const support = Math.min(1, center / 4.5, (totalLength - center) / 4.5)
    let adjustment = 0
    for (const { distance, weight } of edgeTaps) {
      const reach = distance * support
      const before = railAt(rail, distanceAlong, center - reach)
      const after = railAt(rail, distanceAlong, center + reach)
      adjustment += weight * (dot(delta(knot, before), normals[i]) + dot(delta(knot, after), normals[i])) / 2
    }
    // Sample the boundary by distance, then move only its normal component.
    // Both end caps and every stored centerline sample stay anchored.
    const limit = Math.min(0.5, radii[i] * 0.24)
    const correction = adjustment * 0.83 * support
    return offset(knot, normals[i], Math.max(-limit, Math.min(limit, correction)))
  })
}

function railCurves(rail: Vector[], start: Vector, end: Vector): string {
  const directions = rail.slice(1).map((knot, i) => unit(delta(rail[i], knot)))
  const tangents = rail.map((_, i) => i === 0 ? start : i === rail.length - 1
    ? end : bisect(directions[i - 1], directions[i]))
  return rail.slice(1).map((knot, i) => {
    const previous = rail[i]
    const span = length(delta(previous, knot))
    const forward = directions[i]
    const outgoing = dot(tangents[i], forward) > 0 ? tangents[i] : forward
    const incoming = dot(tangents[i + 1], forward) > 0 ? tangents[i + 1] : forward
    const handle = (direction: Vector): number => {
      const sideways = Math.abs(direction.x * forward.y - direction.y * forward.x)
      return sideways > 0 ? Math.min(span / 3, 0.55 / sideways) : span / 3
    }
    return `C${serialize(offset(previous, outgoing, handle(outgoing)))} ` +
      `${serialize(offset(knot, incoming, -handle(incoming)))} ${serialize(knot)}`
  }).join('')
}

function smoothRun(points: InkPoint[], diameters: number[]): string {
  if (points.length < 3) return nibOutline(points, diameters)
  const segments = points.slice(1).map((center, i) => delta(points[i], center))
  const distanceAlong = [0]
  for (const segment of segments) distanceAlong.push(distanceAlong.at(-1)! + length(segment))
  const runLength = distanceAlong.at(-1)!
  if (runLength < Math.max(diameters[0], diameters.at(-1)!) * 0.7) {
    return nibOutline(points, diameters)
  }
  const radii = diameters.map((diameter) => diameter / 2)
  const headings = segments.map(unit)
  const left = makeRail(points, radii, headings, distanceAlong, 1)
  const right = makeRail(points, radii, headings, distanceAlong, -1)
  const foldsBack = headings.map((heading, i) =>
    dot(delta(left[i], left[i + 1]), heading) <= 0 ||
    dot(delta(right[i], right[i + 1]), heading) <= 0
  )
  const last = points.length - 1
  const cap = (radius: number, target: Vector): string =>
    `A${number(radius)} ${number(radius)} 0 0 1 ${serialize(target)}`
  const outlineSection = (first: number, final: number): string => {
    const forward = headings[first]
    const end = headings[final - 1]
    const leftSide = left.slice(first, final + 1)
    const rightSide = right.slice(first, final + 1).reverse()
    const endJoin = final === last ? cap(radii[final], right[final]) : `L${serialize(right[final])}`
    const startJoin = first === 0 ? cap(radii[first], left[first]) : `L${serialize(left[first])}`
    return `M${serialize(left[first])}${railCurves(leftSide, forward, end)}` +
      endJoin +
      railCurves(rightSide, { x: -end.x, y: -end.y }, { x: -forward.x, y: -forward.y }) +
      startJoin + 'Z'
  }

  // Keep the rails already calculated for safe segments. The swept-nib
  // section contributes round caps at its joins, covering both cut edges.
  const contours: string[] = []
  let first = 0
  for (let final = 1; final <= last; final++) {
    if (foldsBack[final] === foldsBack[first]) continue
    contours.push(foldsBack[first]
      ? nibOutline(points.slice(first, final + 1), diameters.slice(first, final + 1))
      : outlineSection(first, final))
    first = final
  }
  return contours.join('')
}

export function smoothNibOutline(points: InkPoint[], diameters: number[]): string {
  if (points.length < 3) return nibOutline(points, diameters)
  const contours: string[] = []
  let start = 0
  let previous = unit(delta(points[0], points[1]))
  for (let i = 1; i < points.length - 1; i++) {
    const next = unit(delta(points[i], points[i + 1]))
    // Keep the original round join at sharp turns. Both runs meet at the same sample.
    if (dot(previous, next) < 0.25) {
      contours.push(smoothRun(points.slice(start, i + 1), diameters.slice(start, i + 1)))
      start = i
    }
    previous = next
  }
  contours.push(smoothRun(points.slice(start), diameters.slice(start)))
  return contours.join('')
}
