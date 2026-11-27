import type { InkPoint } from '../../../shared/editor'

export type InkSample = InkPoint & { time: number }

const distance = (a: InkPoint, b: InkPoint): number => Math.hypot(b.x - a.x, b.y - a.y)
const position = ({ x, y, pressure }: InkSample): InkPoint => ({ x, y, pressure })

/** Keeps one unconfirmed sample so a coordinate spike can be dropped before it joins the stroke. */
export class InkInput {
  private readonly points: InkPoint[]
  private previous: InkSample
  private pending?: InkSample
  private lastSegment = 0

  constructor(
    first: InkSample,
    private readonly screenScale: number,
    private readonly strength: number,
    private readonly stylus: boolean
  ) {
    this.previous = first
    this.points = [position(first)]
  }

  private isSpike(a: InkSample, b: InkSample, c: InkSample): boolean {
    const shorterSide = Math.min(distance(a, b), distance(b, c))
    return this.stylus && c.time - a.time <= 48 && shorterSide * this.screenScale >= 16 &&
      distance(a, c) < shorterSide * 0.48
  }

  private smooth(a: InkSample, b: InkSample, c: InkSample): InkPoint {
    const dx = c.x - a.x
    const dy = c.y - a.y
    const span = Math.hypot(dx, dy)
    if (!span || this.strength === 0) return position(b)

    // Correct sideways noise without changing the sample's progress along the stroke.
    const along = ((b.x - a.x) * dx + (b.y - a.y) * dy) / (span * span)
    if (along <= 0 || along >= 1) return position(b)
    const offsetX = a.x + dx * along - b.x
    const offsetY = a.y + dy * along - b.y
    const sideways = Math.hypot(offsetX, offsetY) * this.screenScale
    const speed = span * this.screenScale / Math.max(6, c.time - a.time) * 1000
    // Less correction on fast strokes and pronounced corners.
    const cornerWeight = Math.min(1, 4 / Math.max(4, sideways))
    const weight = Math.min(0.82, this.strength * 1.32 / (1 + speed / 1200)) * cornerWeight ** 2
    return { x: b.x + offsetX * weight, y: b.y + offsetY * weight, pressure: b.pressure }
  }

  add(sample: InkSample): void {
    const last = this.pending ?? this.previous
    if (this.points.length >= 99_999) return
    if (distance(last, sample) * this.screenScale < 0.35) {
      if (!this.pending && this.points.length === 1 && sample.pressure >= 0.055) {
        const pressure = this.previous.pressure < 0.055
          ? sample.pressure
          : this.previous.pressure + (sample.pressure - this.previous.pressure) * 0.25
        this.previous = { ...this.previous, pressure }
        this.points[0] = position(this.previous)
      }
      return
    }
    if (this.pending && !this.isSpike(this.previous, this.pending, sample)) {
      this.points.push(this.smooth(this.previous, this.pending, sample))
      this.lastSegment = distance(this.previous, this.pending) * this.screenScale
      this.previous = this.pending
    }
    this.pending = sample
  }

  preview(): InkPoint[] {
    if (!this.pending) return this.points
    const jump = distance(this.previous, this.pending) * this.screenScale
    if (this.stylus && this.lastSegment > 0 && jump > Math.max(16, this.lastSegment * 3)) {
      return this.points
    }
    return [...this.points, position(this.pending)]
  }

  finish(release?: InkSample): InkPoint[] {
    if (release) {
      const last = this.pending ?? this.previous
      const travel = distance(last, release)
      const step = distance(this.previous, last)
      const limit = release.time - last.time > 120 ? 6 : 9
      const continuesStroke = this.pending && step > 0 && travel > 0 &&
        release.time - last.time <= 120 && travel * this.screenScale <= 56 && travel <= step * 2.4 &&
        (last.x - this.previous.x) * (release.x - last.x) +
          (last.y - this.previous.y) * (release.y - last.y) > step * travel * 0.55
      const returnsFromSpike = this.pending && this.isSpike(this.previous, this.pending, release)
      if (!this.stylus || returnsFromSpike || continuesStroke || travel * this.screenScale <= limit) {
        this.add({ ...release, pressure: last.pressure })
      }
    }
    return this.pending ? [...this.points, position(this.pending)] : this.points
  }
}
