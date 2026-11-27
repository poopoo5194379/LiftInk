import type { NotePage, PenStyle } from '../../../shared/editor'

export const preferenceDefaults = {
  startup: 'home' as 'home' | 'workspace',
  restoreNote: true,
  close: 'exit' as 'exit' | 'tray',
  newFolder: 'current' as 'current' | 'all',
  theme: 'system' as 'light' | 'dark' | 'system',
  accent: 'purple' as 'purple' | 'blue' | 'green' | 'rose',
  scale: 100,
  rememberSidebar: true,
  fileLayout: 'list' as 'list' | 'grid',
  stability: 0.35,
  pressureCurve: 1,
  pressure: true,
  penStyle: 'fountain' as PenStyle,
  penWidth: 4,
  device: 'auto' as 'auto' | 'pen' | 'mouse',
  sideButton: 'none' as 'none' | 'erase' | 'hand' | 'select',
  ignoreTouch: true,
  noteType: 'paged' as 'paged' | 'board',
  paperSize: 'a4' as 'a4' | 'a5' | 'custom',
  paperWidth: 794,
  paperHeight: 1123,
  paper: 'lines' as NotePage['paper'],
  paperColor: 'white' as NonNullable<NotePage['paperColor']>,
  initialZoom: 'actual' as 'width' | 'page' | 'actual',
  backupInterval: 0,
  exportFormat: 'pdf' as 'pdf' | 'png' | 'liftink',
  exportBackground: true,
  exportScale: 2
}

export type Preferences = typeof preferenceDefaults
export const preferenceKey = 'liftink:preferences'

export function legacyBrushPreferences(): Partial<Preferences> {
  const stability = localStorage.getItem('liftink.pen.stability')
  const curve = localStorage.getItem('liftink.pen.curve')
  const prefs: Partial<Preferences> = {}
  if (stability !== null && Number(stability) >= 0 && Number(stability) <= 1) prefs.stability = Number(stability)
  if (curve !== null && Number(curve) >= 0.5 && Number(curve) <= 2) prefs.pressureCurve = Number(curve)
  return prefs
}

export const accentColors: Record<Preferences['accent'], string> = {
  purple: '#7656c7', blue: '#386fbd', green: '#39765a', rose: '#a34776'
}

export function defaultNotePage(preferences: Preferences, board: boolean): Pick<NotePage, 'size' | 'paper' | 'paperColor'> {
  const size = board ? { width: 1600, height: 1200 } : preferences.paperSize === 'a5'
    ? { width: 559, height: 794 } : preferences.paperSize === 'custom'
      ? { width: preferences.paperWidth, height: preferences.paperHeight } : { width: 794, height: 1123 }
  return { size, paper: board ? 'blank' : preferences.paper, paperColor: preferences.paperColor }
}
