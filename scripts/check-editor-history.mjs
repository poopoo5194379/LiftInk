import { strict as assert } from 'node:assert'
import { DocumentHistory } from '../src/renderer/src/editor/history.ts'

const initial = {
  version: 1,
  noteId: 'history-check',
  pages: [{ id: 'page-1', paper: 'lines', elements: [] }]
}
const history = new DocumentHistory(initial)
const stroke = {
  kind: 'ink',
  id: 'ink-1',
  color: '#433654',
  width: 4,
  points: [
    { x: 1, y: 2, pressure: 0.4 },
    { x: 5, y: 7, pressure: 0.8 }
  ]
}
const image = {
  kind: 'image',
  id: 'image-1',
  assetId: `${'a'.repeat(64)}.png`,
  x: 10,
  y: 20,
  width: 100,
  height: 80
}
history.changeElements('page-1', [
  { id: stroke.id, after: stroke },
  { id: image.id, after: image }
])
assert.deepEqual(
  history.current.pages[0].elements.map((item) => item.id),
  ['ink-1', 'image-1']
)
history.undo()
assert.equal(history.current.pages[0].elements.length, 0)
history.redo()
assert.deepEqual(
  history.current.pages[0].elements.map((item) => item.id),
  ['ink-1', 'image-1']
)
history.changeElements('page-1', [{ id: image.id, after: { ...image, x: 45 } }])
assert.equal(history.current.pages[0].elements[1].x, 45)
history.undo()
assert.equal(history.current.pages[0].elements[1].x, 10)
history.changeElements('page-1', [{ id: stroke.id, after: null }])
assert.equal(history.canRedo, false)
assert.deepEqual(
  history.current.pages[0].elements.map((item) => item.id),
  ['image-1']
)
history.undo()
assert.deepEqual(
  history.current.pages[0].elements.map((item) => item.id),
  ['ink-1', 'image-1']
)
history.setPaper('page-1', 'grid')
history.addPage({ id: 'page-2', paper: 'blank', elements: [] })
assert.equal(history.current.pages.length, 2)
history.undo()
assert.equal(history.current.pages.length, 1)
history.undo()
assert.equal(history.current.pages[0].paper, 'lines')
console.log(
  'Editor history passed: grouped insertion, undo/redo, transform, deletion order, redo branch, page and paper'
)
