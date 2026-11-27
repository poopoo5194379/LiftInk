/// <reference types="vite/client" />
import type { VaultOperation, VaultSettings } from '../../shared/vault'
import type {
  AppDiagnostics,
  CapturedScreen,
  NoteDocument,
  NoteRecord,
  OpenedPdf,
  PdfOcrPage,
  ReleaseUpdate,
  StorageLoad,
  StorageInfo,
  StoredImage,
  StoredMedia
} from '../../shared/editor'

declare global {
  interface Window {
    liftInk: {
      loadVaultSettings: () => Promise<VaultSettings | null>
      seedVaultSettings: (settings: VaultSettings) => Promise<void>
      saveVaultSettings: (settings: VaultSettings) => Promise<void>
      vaultIdentity: () => Promise<string>
      vaultOperation: (operation: VaultOperation, automatic?: boolean) => Promise<string | null>
      applyWindowPreferences: (scale: number, toTray: boolean) => Promise<void>
      storageInfo: () => Promise<StorageInfo>
      openStorageDirectory: () => Promise<void>
      chooseBackupDirectory: () => Promise<string | null>
      writeLibraryBackup: (data: string) => Promise<string>
      appDiagnostics: () => Promise<AppDiagnostics>
      checkReleaseUpdate: () => Promise<ReleaseUpdate | null>
      downloadRelease: (version: string) => Promise<void>
      notifyAgenda: (title: string, due: number) => Promise<boolean>
      takeOpenedPdf: () => Promise<OpenedPdf | null>
      onPdfOpenAvailable: (callback: () => void) => () => void
      onPrepareClose: (save: () => Promise<void>) => void
      loadNoteIndex: () => Promise<StorageLoad<NoteRecord[]>>
      validateNoteRecord: (note: NoteRecord) => Promise<boolean>
      cleanAssets: (ids: string[]) => Promise<{ count: number; bytes: number }>
      sweepTrash: () => Promise<string[]>
      saveNoteIndex: (notes: NoteRecord[]) => Promise<void>
      initializeNote: (note: NoteRecord, initial?: NoteDocument) => Promise<void>
      loadDocument: (id: string) => Promise<StorageLoad<NoteDocument>>
      savePdfOcr: (id: string, page: number, result: PdfOcrPage) => Promise<void>
      loadPdfOcr: (id: string, page: number) => Promise<PdfOcrPage | null>
      loadNativePdfText: (id: string) => Promise<string[] | null>
      saveNativePdfText: (id: string, pages: string[]) => Promise<void>
      recognizeInk: (image: string) => Promise<string>
      recognizePdfPage: (id: string, page: number, image: string, width: number, height: number, refresh?: boolean) => Promise<PdfOcrPage>
      saveDocument: (document: NoteDocument) => Promise<void>
      validateDocument: (document: NoteDocument) => Promise<boolean>
      storeImage: (mime: string, base64: string) => Promise<StoredImage>
      loadImage: (id: string) => Promise<StoredImage>
      storePdfSource: (bytes: Uint8Array) => Promise<string>
      readPdfSource: (id: string) => Promise<Uint8Array>
      storeMedia: (mime: string, base64: string) => Promise<StoredMedia>
      loadMedia: (id: string) => Promise<StoredMedia>
      saveExport: (kind: 'pdf' | 'png' | 'zip' | 'liftink' | 'json' | 'md', filename: string, base64: string) => Promise<string | null>
      exportMarkdownPdf: (title: string, html: string) => Promise<string | null>
      captureScreen: () => Promise<CapturedScreen>
      pinImage: (id: string) => Promise<void>
    }
  }
}
