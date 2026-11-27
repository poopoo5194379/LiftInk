import type { NotePage } from '../../../shared/editor'
import { isHighlighter } from './ink'

export function visibleHandwriting(page: NotePage): NotePage['elements'] {
  return page.elements.filter((item) => item.kind === 'ink' && !isHighlighter(item) &&
    page.layers?.find((layer) => layer.id === (item.layerId ?? 'base'))?.visible !== false)
}

export async function handwritingSignature(page: NotePage): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(visibleHandwriting(page)))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
