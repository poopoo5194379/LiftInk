import { degrees, PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import type { NoteDocument, NotePage } from '../../../shared/editor'
import { inkOpacity, isHighlighter, multiplyHighlighter, orderedElements, strokePath } from './ink'
import { pdfPageImage } from './pdfSource'
import { pageSize, paperColors, paperPattern } from './paper'
import { canvasTextStyle, layoutCanvasText } from './canvasText'

const escape = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

export function pageSvg(page: NotePage, assets: Record<string, string>, includeBackground: boolean, transparent = false): string {
  const { width, height } = pageSize(page)
  const pattern = paperPattern(page)
  const paper = pattern
    ? `<pattern id="paper" width="${pattern.width}" height="${pattern.height}" patternUnits="userSpaceOnUse"><path d="${pattern.path}" fill="none" stroke="${pattern.color}" stroke-width="1"/></pattern>`
    : ''
  const background = includeBackground && page.backgroundAssetId && assets[page.backgroundAssetId]
    ? `<image href="${assets[page.backgroundAssetId]}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`
    : includeBackground && !transparent && paper ? `<rect width="${width}" height="${height}" fill="url(#paper)"/>` : ''
  const multiply = multiplyHighlighter(page)
  const elements = orderedElements(page.elements).filter((element) => page.layers?.find((layer) => layer.id === (element.layerId ?? 'base'))?.visible !== false).map((element, index) => {
    if (element.kind === 'ink') return `<path d="${strokePath(element.points, element)}" fill="${element.color}" opacity="${inkOpacity(element)}"${multiply && isHighlighter(element) ? ' style="mix-blend-mode:multiply"' : ''}/>`
    if (element.kind === 'image') return assets[element.assetId] ? `<image href="${assets[element.assetId]}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="none"/>` : ''
    if (element.kind === 'text') {
      const layout = layoutCanvasText(element, width)
      const clip = `text-box-${index}`
      return `<defs><clipPath id="${clip}"><rect x="${layout.x}" y="${element.y - element.fontSize}" width="${layout.width}" height="${layout.height}"/></clipPath></defs><text clip-path="url(#${clip})" x="${layout.x}" y="${element.y}" font-size="${element.fontSize}" fill="${element.color}" xml:space="preserve">${layout.lines.map((line, index) =>
      `<tspan x="${layout.x}" y="${element.y + index * element.fontSize * 1.5}">${line.map((run) => {
        const style = canvasTextStyle(run, element.font)
        return `<tspan fill="${escape(run.color ?? element.color)}" font-family="${style.fontFamily}" font-weight="${style.fontWeight ?? 400}" font-style="${style.fontStyle ?? 'normal'}" text-decoration="${style.textDecoration ?? 'none'}">${escape(run.text)}</tspan>`
      }).join('')}</tspan>`).join('')}</text>`
    }
    if (element.kind === 'shape') return element.shape === 'rect' ? `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"/>` : element.shape === 'ellipse' ? `<ellipse cx="${element.x + element.width / 2}" cy="${element.y + element.height / 2}" rx="${Math.abs(element.width / 2)}" ry="${Math.abs(element.height / 2)}" fill="none" stroke="${element.color}" stroke-width="${element.strokeWidth}"/>` : `<path d="M${element.x} ${element.y}L${element.x + element.width} ${element.y + element.height}" stroke="${element.color}" stroke-width="${element.strokeWidth}"/>`
    return element.revealed ? '' : `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="5" fill="#d9cee9"/>`
  }).join('')
  const color = includeBackground ? paperColors[page.paperColor ?? 'white'] : 'white'
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${paper}</defs>${transparent ? '' : `<rect width="${width}" height="${height}" fill="${color}"/>`}${background}${elements}</svg>`
}

export async function renderPng(page: NotePage, assets: Record<string, string>, includeBackground: boolean, transparent = false, resolution = 2): Promise<Uint8Array> {
  if (includeBackground && !page.backgroundAssetId && page.sourcePdfId && page.sourcePageNumber) {
    const original = await pdfPageImage(page.sourcePdfId, page.sourcePageNumber)
    page = { ...page, backgroundAssetId: 'source' }
    assets = { ...assets, source: original }
  }
  const svg = pageSvg(page, assets, includeBackground, transparent)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('页面渲染失败')); image.src = url })
    const canvas = document.createElement('canvas')
    const { width, height } = pageSize(page)
    const scale = Math.min(resolution, 4096 / Math.max(width, height))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 编码失败')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}

export async function exportPages(document: NoteDocument, assets: Record<string, string>, format: 'pdf' | 'png', pageIds: string[], includeBackground: boolean, resolution = 2): Promise<Uint8Array> {
  const pages = document.pages.filter((page) => pageIds.includes(page.id))
  if (!pages.length) throw new Error('请选择至少一页')
  if (format === 'pdf') {
    const sources = new Map<string, PDFDocument>()
    const firstSource = includeBackground ? pages[0].sourcePdfId : undefined
    let originalDocument: PDFDocument | undefined
    if (firstSource && pages.every((page, index) => page.sourcePdfId === firstSource && page.sourcePageNumber === index + 1)) {
      const source = await PDFDocument.load(await window.liftInk.readPdfSource(firstSource))
      sources.set(firstSource, source)
      if (source.getPageCount() === pages.length) originalDocument = source
    }
    const pdf = originalDocument ?? await PDFDocument.create()
    for (const page of pages) {
      const { width, height } = pageSize(page)
      if (includeBackground && page.sourcePdfId && page.sourcePageNumber) {
        let source = sources.get(page.sourcePdfId)
        if (!source) {
          source = await PDFDocument.load(await window.liftInk.readPdfSource(page.sourcePdfId))
          sources.set(page.sourcePdfId, source)
        }
        const original = originalDocument
          ? originalDocument.getPage(page.sourcePageNumber - 1)
          : (await pdf.copyPages(source, [page.sourcePageNumber - 1]))[0]
        if (!originalDocument) pdf.addPage(original)
        if (!page.elements.length) continue
        const crop = original.getCropBox()
        const angle = ((original.getRotation().angle % 360) + 360) % 360
        const sideways = angle === 90 || angle === 270
        const visualWidth = sideways ? crop.height : crop.width
        const visualHeight = sideways ? crop.width : crop.height
        const scale = Math.min(width / visualWidth, height / visualHeight)
        const left = (visualWidth - width / scale) / 2
        const bottom = (visualHeight - height / scale) / 2
        const origins = {
          0: [crop.x + left, crop.y + bottom],
          90: [crop.x + crop.width - bottom, crop.y + left],
          180: [crop.x + crop.width - left, crop.y + crop.height - bottom],
          270: [crop.x + bottom, crop.y + crop.height - left]
        }
        const [x, y] = origins[angle as keyof typeof origins] ?? origins[0]
        const overlay = await pdf.embedPng(await renderPng(page, assets, false, true, resolution))
        original.drawImage(overlay, { x, y, width: width / scale, height: height / scale, rotate: degrees(angle) })
      } else {
        const png = await pdf.embedPng(await renderPng(page, assets, includeBackground, false, resolution))
        pdf.addPage([width, height]).drawImage(png, { x: 0, y: 0, width, height })
      }
    }
    return pdf.save()
  }
  if (pages.length === 1) return renderPng(pages[0], assets, includeBackground, false, resolution)
  const zip = new JSZip()
  for (let i = 0; i < pages.length; i++) zip.file(`page-${String(i + 1).padStart(3, '0')}.png`, await renderPng(pages[i], assets, includeBackground, false, resolution))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function makeBackup(document: NoteDocument, assets: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ format: 'liftink', version: 1, document }))
  for (const [id, dataUrl] of Object.entries(assets)) zip.file(`assets/${id}`, dataUrl.split(',')[1], { base64: true })
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
