import { InkInput, type InkSample } from './inkInput'
import { penStyles, straightLinePoints, type StrokeBrush } from './ink'
import type { InkPoint } from '../../../shared/editor'

export const maxTraceSamples = 8192

export type InkTrace = {
  version: 1
  samples: InkSample[]
  release?: InkSample
  straightened?: boolean
  screenScale: number
  stylus: boolean
  brush: StrokeBrush
}

function isSample(value: unknown): value is InkSample {
  if (!value || typeof value !== 'object') return false
  const { x, y, pressure, time } = value as InkSample
  return [x, y].every((coordinate) => Number.isFinite(coordinate) && Math.abs(coordinate) <= 100_000) &&
    Number.isFinite(pressure) && pressure >= 0 && pressure <= 1 &&
    Number.isFinite(time) && time >= 0
}

export function parseInkTrace(source: string): InkTrace {
  const value: unknown = JSON.parse(source)
  if (!value || typeof value !== 'object') throw new Error('采样文件格式无效')
  const trace = value as InkTrace
  const { brush } = trace
  if (trace.version !== 1 || !Array.isArray(trace.samples) || !trace.samples.length ||
      trace.samples.length > maxTraceSamples || !trace.samples.every(isSample) ||
      (trace.release !== undefined && !isSample(trace.release)) ||
      (trace.straightened !== undefined && typeof trace.straightened !== 'boolean') ||
      typeof trace.stylus !== 'boolean' || !Number.isFinite(trace.screenScale) ||
      trace.screenScale <= 0 || trace.screenScale > 10 ||
      !brush || brush.brush !== 'pen' || !Number.isFinite(brush.width) || brush.width <= 0 || brush.width > 100 ||
      (brush.penStyle !== undefined && !Object.hasOwn(penStyles, brush.penStyle)) ||
      (brush.stability !== undefined && (!Number.isFinite(brush.stability) || brush.stability < 0 || brush.stability > 1)) ||
      (brush.pressureCurve !== undefined && (!Number.isFinite(brush.pressureCurve) || brush.pressureCurve < 0.5 || brush.pressureCurve > 2)) ||
      (brush.pressureSensitive !== undefined && typeof brush.pressureSensitive !== 'boolean')) {
    throw new Error('采样文件格式无效')
  }
  const copySample = ({ x, y, pressure, time }: InkSample): InkSample => ({ x, y, pressure, time })
  return {
    version: 1,
    samples: trace.samples.map(copySample),
    release: trace.release && copySample(trace.release),
    straightened: trace.straightened,
    screenScale: trace.screenScale,
    stylus: trace.stylus,
    brush: {
      brush: 'pen',
      width: brush.width,
      penStyle: brush.penStyle,
      stability: brush.stability,
      pressureCurve: brush.pressureCurve,
      pressureSensitive: brush.pressureSensitive
    }
  }
}

export function replayInkTrace(trace: InkTrace): InkPoint[] {
  const [first, ...moves] = trace.samples
  const input = new InkInput(first, trace.screenScale, trace.brush.stability ?? 0, trace.stylus)
  for (const point of moves) input.add(point)
  const points = input.finish(trace.release)
  return trace.straightened ? straightLinePoints(points) : points
}
