import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { createServer } from 'vite'

const root = await mkdtemp(join(tmpdir(), 'liftink-ink-contour-'))
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } })
const app = await electron.launch({ args: ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
try {
  const { strokePath } = await server.ssrLoadModule('/src/renderer/src/editor/ink.ts')
  const line = Array.from({ length: 33 }, (_, index) => ({
    x: 12 + index * 1.8,
    y: 30 + (index % 2 ? 0.48 : -0.48),
    pressure: 0.35
  }))
  const hook = [[15, 50], [22, 50.15], [29, 50], [36, 50], [36, 57], [36, 64], [32, 67], [27, 63]]
    .map(([x, y]) => ({ x, y, pressure: 0.35 }))
  const dot = [{ x: 12, y: 12, pressure: 0.35 }]
  const short = [...dot, { x: 14, y: 12, pressure: 0.35 }]
  const loop = Array.from({ length: 21 }, (_, index) => ({
    x: 48 + 9 * Math.cos(index * Math.PI / 10),
    y: 72 + 9 * Math.sin(index * Math.PI / 10),
    pressure: 0.35
  }))
  const brush = { brush: 'pen', inkVersion: 3, width: 7, pressureSensitive: false }
  const samples = [line, hook, dot, short, loop]
  const before = JSON.stringify(samples)
  const paths = [...samples.map((points) => strokePath(points, brush)), strokePath(line, brush, false)]
  assert.equal(JSON.stringify(samples), before, 'rendering must not change the input data')
  const page = await app.firstWindow()
  const result = await page.evaluate(({ paths, samples }) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.append(svg)
    const shapes = paths.map((data) => {
      const path = document.createElementNS(svg.namespaceURI, 'path')
      path.setAttribute('d', data)
      svg.append(path)
      return path
    })
    const top = (path, x) => {
      let outside = 25
      let inside = 30
      for (let i = 0; i < 15; i++) {
        const y = (outside + inside) / 2
        if (path.isPointInFill(new DOMPoint(x, y))) inside = y
        else outside = y
      }
      return inside
    }
    const variation = (path) => {
      const edges = Array.from({ length: 180 }, (_, index) => top(path, 17 + index * 0.26))
      return edges.slice(1).reduce((sum, value, index) => sum + Math.abs(value - edges[index]), 0)
    }
    const ripple = variation(shapes[0])
    const baseline = variation(shapes.at(-1))
    const covered = samples.every((points, i) => points.every(({ x, y }, index) => {
      const previous = samples[i][index - 1] ?? { x, y }
      return [0.25, 0.5, 0.75, 1].every((t) =>
        shapes[i].isPointInFill(new DOMPoint(previous.x + (x - previous.x) * t, previous.y + (y - previous.y) * t)))
    }))
    const loopHole = !shapes[4].isPointInFill(new DOMPoint(48, 72))
    const bounds = shapes.map((path) => {
      const { x, y, width, height } = path.getBBox()
      return { x, y, width, height }
    })
    svg.remove()
    return { ripple, baseline, covered, loopHole, bounds }
  }, { paths, samples })
  console.log(`Contour total edge variation: ${result.baseline.toFixed(2)} → ${result.ripple.toFixed(2)}`)
  assert(result.ripple < result.baseline * 0.65, 'the shallow waves along the stroke edge should be softened')
  assert(result.covered, 'the contour must continue to cover the original centerline and the hook')
  assert(result.loopHole, 'smoothing must not fill the interior of a loop')
  for (const [i, expected] of [[2, [8.5, 8.5, 7, 7]], [3, [8.5, 8.5, 9, 7]]]) {
    const box = result.bounds[i]
    assert([box.x, box.y, box.width, box.height].every((value, axis) => Math.abs(value - expected[axis]) < 0.01),
      'dot and short-stroke caps keep their original footprint')
  }
} finally {
  await server.close()
  await app.close()
  await rm(root, { recursive: true, force: true })
}
