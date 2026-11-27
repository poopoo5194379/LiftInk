import type { InkPoint } from '../../../shared/editor'

const clamp = (value: number): number => Math.max(0, Math.min(1, value))
const median = (a: number, b: number, c: number): number =>
  a + b + c - Math.min(a, b, c) - Math.max(a, b, c)

export function strokeDiameters(
  points: InkPoint[],
  size: number,
  influence: number,
  curve: number
): number[] {
  // Chromium can report a constant 0.5 for an active pointer with no pressure sensor.
  if (!influence || !points.some(({ pressure }) => Math.abs(clamp(pressure) - 0.5) > 0.025)) {
    return points.map(() => size)
  }

  const pressures = points.map(({ pressure }) => clamp(pressure))
  const filtered = pressures.map((pressure, index) => {
    const before = pressures[index - 1]
    const after = pressures[index + 1]
    if (before !== undefined && after !== undefined) return median(before, pressure, after)

    // Keep an intentional taper in the contact data, and suppress an isolated endpoint impulse.
    const near = before ?? after
    const next = pressures[index + (before === undefined ? 2 : -2)]
    if (near !== undefined && next !== undefined && Math.abs(near - next) < 0.08 && Math.abs(pressure - near) > 0.16) {
      return (near + next) / 2
    }
    return pressure
  })

  let smoothed = filtered[0] ?? 0.5
  return filtered.map((pressure, index) => {
    const previous = points[index - 1]
    if (previous) {
      const gap = Math.hypot(points[index].x - previous.x, points[index].y - previous.y)
      const response = Math.min(0.85, Math.max(0.2, gap / size))
      smoothed += (pressure - smoothed) * response
    }
    return size * (1 - influence + influence * Math.pow(smoothed, curve))
  })
}
