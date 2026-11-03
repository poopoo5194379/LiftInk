/// <reference types="vite/client" />
import type {
  CapturedScreen,
  NoteDocument,
  NoteRecord,
  StorageLoad,
  StoredImage
} from '../../shared/editor'

declare global {
  interface Window {
    liftInk: {
      chooseImports: () => Promise<{ name: string; kind: 'pdf' | 'image' }[]>
      loadNoteIndex: () => Promise<StorageLoad<NoteRecord[]>>
      saveNoteIndex: (notes: NoteRecord[]) => Promise<void>
      loadDocument: (id: string) => Promise<StorageLoad<NoteDocument>>
      saveDocument: (document: NoteDocument) => Promise<void>
      storeImage: (mime: string, base64: string) => Promise<StoredImage>
      loadImage: (id: string) => Promise<StoredImage>
      captureScreen: () => Promise<CapturedScreen>
      pinImage: (id: string) => Promise<void>
    }
  }
}
