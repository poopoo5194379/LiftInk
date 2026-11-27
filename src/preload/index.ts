// Home UI needs no privileged APIs. Add individually reviewed IPC methods here
// only when a later feature requires them.
import { contextBridge, ipcRenderer } from 'electron'
import type { VaultOperation, VaultSettings } from '../shared/vault'
import type { AppDiagnostics, CapturedScreen, NoteDocument, NoteRecord, OpenedPdf, PdfOcrPage, ReleaseUpdate, StorageInfo, StoredImage, StoredMedia } from '../shared/editor'

let flushEditor: (() => Promise<void>) | undefined
ipcRenderer.on('liftink:prepare-close', (_event, request: string) => {
  void Promise.resolve().then(() => flushEditor?.()).then(
    () => ipcRenderer.send('liftink:prepared-close', request, true),
    () => ipcRenderer.send('liftink:prepared-close', request, false)
  )
})

contextBridge.exposeInMainWorld('liftInk', {
  loadVaultSettings: (): Promise<VaultSettings | null> => ipcRenderer.invoke('liftink:load-vault-settings'),
  seedVaultSettings: (settings: VaultSettings): Promise<void> => ipcRenderer.invoke('liftink:seed-vault-settings', settings),
  saveVaultSettings: (settings: VaultSettings): Promise<void> => ipcRenderer.invoke('liftink:save-vault-settings', settings),
  vaultIdentity: (): Promise<string> => ipcRenderer.invoke('liftink:vault-identity'),
  vaultOperation: (operation: VaultOperation, automatic = false): Promise<string | null> => ipcRenderer.invoke('liftink:vault-operation', operation, automatic),
  applyWindowPreferences: (scale: number, toTray: boolean): Promise<void> => ipcRenderer.invoke('liftink:apply-window-preferences', scale, toTray),
  storageInfo: (): Promise<StorageInfo> => ipcRenderer.invoke('liftink:storage-info'),
  openStorageDirectory: (): Promise<void> => ipcRenderer.invoke('liftink:open-storage-directory'),
  chooseBackupDirectory: (): Promise<string | null> => ipcRenderer.invoke('liftink:choose-backup-directory'),
  writeLibraryBackup: (data: string): Promise<string> => ipcRenderer.invoke('liftink:write-library-backup', data),
  appDiagnostics: (): Promise<AppDiagnostics> => ipcRenderer.invoke('liftink:app-diagnostics'),
  checkReleaseUpdate: (): Promise<ReleaseUpdate | null> => ipcRenderer.invoke('liftink:check-release-update'),
  downloadRelease: (version: string): Promise<void> => ipcRenderer.invoke('liftink:download-release', version),
  notifyAgenda: (title: string, due: number): Promise<boolean> => ipcRenderer.invoke('liftink:notify-agenda', title, due),
  takeOpenedPdf: (): Promise<OpenedPdf | null> => ipcRenderer.invoke('liftink:take-opened-pdf'),
  onPdfOpenAvailable: (callback: () => void): (() => void) => {
    const notify = (): void => callback()
    ipcRenderer.on('liftink:pdf-open-available', notify)
    return () => { ipcRenderer.removeListener('liftink:pdf-open-available', notify) }
  },
  onPrepareClose: (save: () => Promise<void>): void => {
    flushEditor = save
  },
  loadNoteIndex: (): Promise<NoteRecord[] | null> => ipcRenderer.invoke('liftink:load-note-index'),
  validateNoteRecord: (note: NoteRecord): Promise<boolean> => ipcRenderer.invoke('liftink:validate-note-record', note),
  cleanAssets: (ids: string[]) => ipcRenderer.invoke('liftink:clean-assets', ids),
  sweepTrash: (): Promise<string[]> => ipcRenderer.invoke('liftink:sweep-trash'),
  saveNoteIndex: (notes: NoteRecord[]): Promise<void> =>
    ipcRenderer.invoke('liftink:save-note-index', notes),
  initializeNote: (note: NoteRecord, initial?: NoteDocument): Promise<void> =>
    ipcRenderer.invoke('liftink:initialize-note', note, initial),
  loadDocument: (id: string): Promise<NoteDocument | null> =>
    ipcRenderer.invoke('liftink:load-document', id),
  savePdfOcr: (id: string, page: number, result: PdfOcrPage): Promise<void> => ipcRenderer.invoke('liftink:save-pdf-ocr', id, page, result),
  loadPdfOcr: (id: string, page: number): Promise<PdfOcrPage | null> =>
    ipcRenderer.invoke('liftink:load-pdf-ocr', id, page),
  loadNativePdfText: (id: string): Promise<string[] | null> => ipcRenderer.invoke('liftink:load-native-pdf-text', id),
  saveNativePdfText: (id: string, pages: string[]): Promise<void> => ipcRenderer.invoke('liftink:save-native-pdf-text', id, pages),
  recognizeInk: (image: string): Promise<string> => ipcRenderer.invoke('liftink:recognize-ink', image),
  recognizePdfPage: (id: string, page: number, image: string, width: number, height: number, refresh = false): Promise<PdfOcrPage> =>
    ipcRenderer.invoke('liftink:recognize-pdf-page', id, page, image, width, height, refresh),
  saveDocument: (document: NoteDocument): Promise<void> =>
    ipcRenderer.invoke('liftink:save-document', document),
  validateDocument: (document: NoteDocument): Promise<boolean> =>
    ipcRenderer.invoke('liftink:validate-document', document),
  storeImage: (mime: string, base64: string): Promise<StoredImage> =>
    ipcRenderer.invoke('liftink:store-image', mime, base64),
  loadImage: (id: string): Promise<StoredImage> => ipcRenderer.invoke('liftink:load-image', id),
  storePdfSource: (bytes: Uint8Array): Promise<string> => ipcRenderer.invoke('liftink:store-pdf-source', bytes),
  readPdfSource: (id: string): Promise<Uint8Array> => ipcRenderer.invoke('liftink:read-pdf-source', id),
  storeMedia: (mime: string, base64: string): Promise<StoredMedia> => ipcRenderer.invoke('liftink:store-media', mime, base64),
  loadMedia: (id: string): Promise<StoredMedia> => ipcRenderer.invoke('liftink:load-media', id),
  saveExport: (kind: 'pdf' | 'png' | 'zip' | 'liftink' | 'json' | 'md', filename: string, base64: string): Promise<string | null> => ipcRenderer.invoke('liftink:save-export', kind, filename, base64),
  exportMarkdownPdf: (title: string, html: string): Promise<string | null> => ipcRenderer.invoke('liftink:export-markdown-pdf', title, html),
  captureScreen: (): Promise<CapturedScreen> => ipcRenderer.invoke('liftink:capture-screen'),
  pinImage: (id: string): Promise<void> => ipcRenderer.invoke('liftink:pin-image', id)
})
