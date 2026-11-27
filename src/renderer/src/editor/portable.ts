import JSZip, { type JSZipObject, type JSZipStreamHelper } from 'jszip'
import type { NoteDocument, NoteRecord } from '../../../shared/editor'
import { referencedAssets } from '../../../shared/noteResources'

const maxArchiveBytes = 170_000_000
const maxIndexBytes = 40_000_000
const assetPattern = /^[a-f0-9]{64}\.(png|jpg|webp|pdf|webm)$/
export type PortableEntry = { note?: NoteRecord; document?: NoteDocument | null }

function readArchivePart(file: JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let size = 0
    const stream = (file as JSZipObject & {
      internalStream: (type: 'uint8array') => JSZipStreamHelper<Uint8Array>
    }).internalStream('uint8array')
    stream.on('data', (chunk: Uint8Array) => {
      size += chunk.length
      if (size > limit) {
        stream.pause()
        reject(new Error('备份解压后超过大小限制'))
        return
      }
      chunks.push(chunk)
    }).on('error', reject).on('end', () => {
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      resolve(bytes)
    }).resume()
  })
}

function pdfPageReferences(entries: PortableEntry[]): Map<string, { id: string; number: number }> {
  const references = new Map<string, { id: string; number: number }>()
  for (const { document } of entries) for (const page of document?.pages ?? []) {
    if (page.sourcePdfId && page.sourcePageNumber) references.set(
      `ocr/${page.sourcePdfId}/${page.sourcePageNumber}.json`, { id: page.sourcePdfId, number: page.sourcePageNumber })
  }
  return references
}

export function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}

export async function loadReferencedAssets(entries: PortableEntry[]): Promise<Record<string, string>> {
  const ids = new Set(entries.flatMap(({ note, document }) => referencedAssets(document, note)))
  const assets: Record<string, string> = {}
  let length = 0
  for (const id of ids) {
    if (!assetPattern.test(id)) throw new Error(`附件引用无效：${id}`)
    const load = /\.(pdf|webm)$/.test(id) ? window.liftInk.loadMedia : window.liftInk.loadImage
    const { dataUrl } = await load(id).catch(() => { throw new Error(`缺少附件：${id}`) })
    length += Math.ceil(dataUrl.length * 3 / 4)
    if (length > maxArchiveBytes) throw new Error('附件超过 170 MB，请分批备份')
    assets[id] = dataUrl
  }
  return assets
}

export async function makePortable(entries: PortableEntry[], settings?: unknown): Promise<Uint8Array> {
  const assets = await loadReferencedAssets(entries)
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ format: 'liftink', version: 2, entries, settings }))
  for (const [id, url] of Object.entries(assets)) zip.file(`assets/${id}`, url.split(',')[1], { base64: true })
  let indexBytes = 0
  for (const [path, { id, number }] of pdfPageReferences(entries)) {
    const result = await window.liftInk.loadPdfOcr(id, number)
    if (!result?.text) continue
    const data = new TextEncoder().encode(JSON.stringify(result))
    indexBytes += data.byteLength
    if (indexBytes > maxIndexBytes) throw new Error('OCR 索引过大，请分批备份')
    zip.file(path, data)
  }
  const output = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  if (output.byteLength > maxArchiveBytes) throw new Error('备份超过 170 MB，请分批备份')
  return output
}

export async function readPortable(file: File): Promise<{ entries: PortableEntry[]; settings?: unknown; zip: JSZip }> {
  if (file.size > maxArchiveBytes) throw new Error('备份文件不能超过 170 MB')
  const zip = await JSZip.loadAsync(file)
  if (Object.keys(zip.files).length > 10_000) throw new Error('备份资源过多')
  const header = zip.file('manifest.json')
  if (!header) throw new Error('备份清单缺失')
  const text = new TextDecoder().decode(await readArchivePart(header, maxIndexBytes))
  const manifest = JSON.parse(text)
  if (manifest?.format !== 'liftink') throw new Error('备份格式不受支持')
  const entries: PortableEntry[] = manifest.version === 1 ? [{ document: manifest.document }] : manifest.version === 2 ? manifest.entries : null
  if (!Array.isArray(entries) || (!entries.length && manifest.settings === undefined) || entries.length > 10_000) throw new Error('备份清单无效')
  const ids = new Set<string>()
  for (const entry of entries) {
    if (!entry || (!entry.note && !entry.document) ||
        (entry.note && !(await window.liftInk.validateNoteRecord(entry.note))) ||
        (entry.document && (!(await window.liftInk.validateDocument(entry.document)) ||
          (entry.note && entry.note.id !== entry.document.noteId))) ||
        (entry.note?.documentExpected && !entry.document)) throw new Error('备份笔记结构无效')
    const id = entry.note?.id ?? entry.document!.noteId
    if (ids.has(id)) throw new Error('备份中存在重复笔记 ID')
    ids.add(id)
  }
  return { entries, settings: manifest.settings, zip }
}

export async function restoreReferencedAssets(zip: JSZip, entries: PortableEntry[]): Promise<void> {
  const ids = new Set(entries.flatMap(({ note, document }) => referencedAssets(document, note)))
  const attachments: { id: string; mime: string; bytes: Uint8Array }[] = []
  let total = 0
  for (const id of ids) {
    if (!assetPattern.test(id)) throw new Error(`附件引用无效：${id}`)
    const file = zip.file(`assets/${id}`)
    if (!file) throw new Error(`备份缺少资源：${id}`)
    const bytes = await readArchivePart(file, maxArchiveBytes - total)
    total += bytes.length
    if (total > maxArchiveBytes) throw new Error('备份解压后过大')
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))), (byte) => byte.toString(16).padStart(2, '0')).join('')
    if (hash !== id.slice(0, 64)) throw new Error(`资源校验失败：${id}`)
    const extension = id.split('.')[1]
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf', webm: 'audio/webm' }[extension]!
    attachments.push({ id, mime, bytes })
  }
  const recognized: { id: string; number: number; result: Parameters<typeof window.liftInk.savePdfOcr>[2] }[] = []
  let indexBytes = 0
  for (const [path, { id, number }] of pdfPageReferences(entries)) {
    const file = zip.file(path)
    if (!file) continue
    const bytes = await readArchivePart(file, Math.min(8_000_000, maxIndexBytes - indexBytes))
    indexBytes += bytes.byteLength
    recognized.push({ id, number, result: JSON.parse(new TextDecoder().decode(bytes)) })
  }
  for (const { id, mime, bytes } of attachments) {
    const store = mime.startsWith('image/') ? window.liftInk.storeImage : window.liftInk.storeMedia
    const storedId = mime === 'application/pdf' ? await window.liftInk.storePdfSource(bytes) : (await store(mime, base64Of(bytes))).assetId
    if (storedId !== id) throw new Error(`资源保存校验失败：${id}`)
  }
  for (const { id, number, result } of recognized) await window.liftInk.savePdfOcr(id, number, result)
}
