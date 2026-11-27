import type { NotePage, PageSize, PaperSpacing } from '../../../shared/editor'

export const paperColors = { white: '#ffffff', cream: '#f9f2e3', gray: '#50515a' }

export function pageSize(page: Pick<NotePage, 'size'>): PageSize {
  return page.size ?? { width: 750, height: 980 }
}

export const paperSpacings = [
  { value: 'compact', label: '紧密' },
  { value: 'standard', label: '标准' },
  { value: 'wide', label: '宽松' }
] as const

const pitches: Record<PaperSpacing, { lines: number; grid: number }> = {
  compact: { lines: 24, grid: 20 },
  standard: { lines: 33, grid: 30 },
  wide: { lines: 44, grid: 40 }
}

export function paperPattern(page: Pick<NotePage, 'paper' | 'paperSpacing' | 'paperColor'>): {
  width: number; height: number; path: string; color: string
} | null {
  if (page.paper === 'blank') return null
  const pitch = pitches[page.paperSpacing ?? 'standard'][page.paper === 'lines' ? 'lines' : 'grid']
  const dark = page.paperColor === 'gray'
  if (page.paper === 'dots') return { width: pitch, height: pitch, path: `M${pitch / 2} ${pitch / 2}h1`, color: dark ? '#9292a4' : '#a8a7b9' }
  if (page.paper === 'lines') {
    return { width: 750, height: pitch, path: `M0 ${pitch - 0.5}H750`, color: dark ? '#70717e' : '#e8eaf2' }
  }
  return {
    width: pitch,
    height: pitch,
    path: `M${pitch} 0.5H0.5V${pitch}`,
    color: dark ? '#70717e' : '#ececf3'
  }
}
