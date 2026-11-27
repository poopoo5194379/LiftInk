import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { createServer } from 'vite'

const widths = [1.5, 2, 3, 4, 5, 6, 8]
const zooms = [1, 1.5, 2]
const pixelRatios = [1, 1.25, 1.5]
const stage = process.env.LIFTINK_INK_STAGE
const baselineFile = process.env.LIFTINK_INK_BASELINE
const actualFile = process.env.LIFTINK_INK_STROKE
const root = await mkdtemp(join(tmpdir(), 'liftink-ink-widths-'))
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } })
const app = await electron.launch({ args: ['.'], env: { ...process.env, LIFTINK_TEST_DATA_DIR: root } })
try {
  const { strokePath } = await server.ssrLoadModule('/src/renderer/src/editor/ink.ts')
  const { InkInput } = await server.ssrLoadModule('/src/renderer/src/editor/inkInput.ts')
  const actual = actualFile ? JSON.parse(await readFile(actualFile, 'utf8')) : undefined
  const ideal = Array.from({ length: 401 }, (_, index) => ({ x: 20 + index * 0.5, y: 50, pressure: 0.5 }))
  const horizontal = Array.from({ length: 40 }, (_, index) => ({
    x: 20 + index * 1.2, y: 50 + Math.sin(index * Math.PI / 2) * 0.24, pressure: 0.5
  }))
  const end = horizontal.at(-1)
  const bend = [...horizontal, ...Array.from({ length: 9 }, (_, index) => {
    const angle = (index + 1) * Math.PI / 26
    return { x: end.x + 3 * Math.sin(angle), y: end.y + 3 * (1 - Math.cos(angle)), pressure: 0.5 }
  })]
  const sampled = bend.map((point, index) => ({
    ...point, pressure: 0.34 + 0.12 * Math.sin(index / 8), time: index * 8
  }))
  const track = (strength) => {
    const input = new InkInput(sampled[0], 1, strength, true)
    for (const sample of sampled.slice(1)) input.add(sample)
    return input.finish()
  }
  const series = [
    { label: '理想直线 / 等压', points: ideal, ideal: true, pressure: false },
    { label: '横画接小弯 / 等压', points: bend, pressure: false },
    { label: '模拟采样 / 压感开启', points: track(0.6), pressure: true },
    { label: '模拟采样 / 关闭轨迹平滑', points: track(0), pressure: true },
    ...(actual ? [
      { label: '实写存档 / 等压', points: actual.points, pressure: false },
      { label: '实写存档 / 保留压力', points: actual.points, pressure: true }
    ] : [])
  ]
  const before = JSON.stringify(series)
  const cases = series.map(({ points, pressure, ...info }) => ({
    ...info,
    points,
    paths: widths.map((width) => strokePath(points, {
      brush: 'pen', inkVersion: 3, width, pressureSensitive: pressure,
      pressureInput: 'pen', pressureCurve: actual?.pressureCurve ?? 1
    }))
  }))
  assert.equal(JSON.stringify(series), before)
  const page = await app.firstWindow()
  await (await app.browserWindow(page)).evaluate((window) => window.setContentSize(1440, 900))
  const report = await page.evaluate(async ({ cases, widths, zooms, pixelRatios }) => {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    document.body.append(svg)
    const path = document.createElementNS(ns, 'path')
    svg.append(path)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const problems = []
    const bendVariation = []
    for (const [row, entry] of cases.entries()) {
      const { points, paths, ideal } = entry
      const xs = points.map(({ x }) => x)
      const ys = points.map(({ y }) => y)
      const left = Math.min(...xs) - 8
      const top = Math.min(...ys) - 8
      const w = Math.max(...xs) - left + 8
      const h = Math.max(...ys) - top + 8
      for (const [col, d] of paths.entries()) {
        path.setAttribute('d', d)
        if (!points.every(({ x, y }) => path.isPointInFill(new DOMPoint(x, y)))) {
          problems.push(`centerline uncovered: row ${row} width ${widths[col]}`)
        }
        if (ideal && Math.abs(path.getBBox().height - widths[col]) > 0.01) {
          problems.push(`straight-line width: ${widths[col]}`)
        }
        if (row === 1) {
          let previous
          let variation = 0
          for (let i = 0; i < 140; i++) {
            const x = 24 + i * 0.24
            let outside = 45
            let inside = 50
            for (let n = 0; n < 13; n++) {
              const y = (outside + inside) / 2
              if (path.isPointInFill(new DOMPoint(x, y))) inside = y
              else outside = y
            }
            if (previous !== undefined) variation += Math.abs(inside - previous)
            previous = inside
          }
          bendVariation.push(variation)
        }
        for (const zoom of zooms) for (const dpr of pixelRatios) {
          const scale = zoom * dpr
          canvas.width = Math.ceil(w * scale)
          canvas.height = Math.ceil(h * scale)
          const image = new Image()
          image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
            `<svg xmlns="${ns}" width="${canvas.width}" height="${canvas.height}" viewBox="${left} ${top} ${canvas.width / scale} ${canvas.height / scale}"><path d="${d}"/></svg>`
          )
          await image.decode()
          context.drawImage(image, 0, 0)
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
          const alpha = (x, y) => data[(y * canvas.width + x) * 4 + 3]
          if (points.some(({ x, y }) => alpha(Math.floor((x - left) * scale), Math.floor((y - top) * scale)) < 32)) {
            problems.push(`raster centerline: row ${row} width ${widths[col]} zoom ${zoom} DPR ${dpr}`)
          }
          if (ideal) {
            const start = Math.floor((30 - left) * scale)
            const end = Math.floor((210 - left) * scale)
            const column = (x) => Array.from({ length: canvas.height }, (_, y) => alpha(x, y)).join(',')
            const first = column(start)
            for (let x = start + 1; x <= end; x++) {
              if (column(x) !== first) {
                problems.push(`raster straight-line variation: width ${widths[col]} zoom ${zoom} DPR ${dpr}`)
                break
              }
            }
          }
        }
      }
    }
    svg.remove()
    return { problems, bendVariation }
  }, { cases, widths, zooms, pixelRatios })
  console.log(`Raster matrix: ${cases.length * widths.length * zooms.length * pixelRatios.length} cases. Vector edge variation on horizontal segment: ${report.bendVariation.map(value => value.toFixed(2)).join(', ')}`)
  assert.deepEqual(report.problems, [])
  const curveCounts = (entry) => entry.paths.map((path) => (path.match(/C/g) ?? []).length)
  console.log('Synthetic and saved-stroke curve counts by width:', [curveCounts(cases[1]), ...(actual ? [curveCounts(cases.at(-2))] : [])])
  if (stage === 'baseline' && baselineFile) await writeFile(baselineFile, JSON.stringify(cases))
  assert(curveCounts(cases[1]).every(count => count >= 68), 'a tight bend must not disable smoothing on the preceding horizontal run')
  if (actual) assert(curveCounts(cases.at(-2))[widths.indexOf(actual.width)] > 0, 'saved handwriting must retain locally smooth runs at its original width')
  assert(report.bendVariation.every(variation => variation < 2.2), 'visible ripple must decrease at every width, including already smooth runs')
  if (stage === 'comparison' && baselineFile) {
    const old = JSON.parse(await readFile(baselineFile, 'utf8'))
    await page.evaluate(({ old, cases, widths }) => {
      const ns = 'http://www.w3.org/2000/svg'
      document.body.replaceChildren()
      Object.assign(document.body.style, { background: '#f5f5fb', margin: '20px', color: '#25233b', fontFamily: 'Microsoft YaHei UI, sans-serif', height: 'auto', overflow: 'auto' })
      const header = document.createElement('h1')
      header.textContent = 'LiftInk 笔宽对照 · 同一中心线 · 修复前后同倍率'
      header.style.fontSize = '20px'
      document.body.append(header)
      const indices = cases.length > 4 ? [1, 4, 5] : [1, 2, 3]
      for (const index of indices) {
        const entry = cases[index]
        const title = document.createElement('h2')
        title.textContent = entry.label
        title.style.fontSize = '15px'
        document.body.append(title)
        const table = document.createElement('div')
        Object.assign(table.style, { display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', alignItems: 'center', gap: '5px' })
        const xs = entry.points.map(({ x }) => x)
        const ys = entry.points.map(({ y }) => y)
        const left = Math.min(...xs) - 5
        const top = Math.min(...ys) - 5
        const w = Math.max(...xs) - left + 5
        const h = Math.max(...ys) - top + 5
        for (const name of ['笔宽', ...widths.map(w => `${w} px`), '修复前', ...old[index].paths, '修复后', ...entry.paths]) {
          if (!name.startsWith('M')) {
            const cell = document.createElement('span')
            cell.textContent = name
            cell.style.fontSize = '12px'
            table.append(cell)
            continue
          }
          const svg = document.createElementNS(ns, 'svg')
          svg.setAttribute('viewBox', `${left} ${top} ${w} ${h}`)
          svg.setAttribute('width', String(2 * w))
          svg.setAttribute('height', String(2 * h))
          Object.assign(svg.style, { background: '#fff', maxWidth: '100%', borderRadius: '4px', justifySelf: 'center' })
          const path = document.createElementNS(ns, 'path')
          path.setAttribute('d', name)
          path.setAttribute('fill', '#222229')
          svg.append(path)
          table.append(svg)
        }
        document.body.append(table)
      }
    }, { old, cases, widths })
    await page.screenshot({ path: 'screenshots/ink-width-comparison.png', scale: 'css' })
  }
} finally {
  await server.close()
  await app.close()
  await rm(root, { recursive: true, force: true })
}
