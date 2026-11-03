// Home UI needs no privileged APIs. Add individually reviewed IPC methods here
// only when a later feature requires them.
import { contextBridge, ipcRenderer } from 'electron'
import type { CapturedScreen, NoteDocument, NoteRecord, StoredImage } from '../shared/editor'

contextBridge.exposeInMainWorld('liftInk', {
  chooseImports: (): Promise<{ name: string; kind: 'pdf' | 'image' }[]> =>
    ipcRenderer.invoke('liftink:choose-imports'),
  loadNoteIndex: (): Promise<NoteRecord[] | null> => ipcRenderer.invoke('liftink:load-note-index'),
  saveNoteIndex: (notes: NoteRecord[]): Promise<void> =>
    ipcRenderer.invoke('liftink:save-note-index', notes),
  loadDocument: (id: string): Promise<NoteDocument | null> =>
    ipcRenderer.invoke('liftink:load-document', id),
  saveDocument: (document: NoteDocument): Promise<void> =>
    ipcRenderer.invoke('liftink:save-document', document),
  storeImage: (mime: string, base64: string): Promise<StoredImage> =>
    ipcRenderer.invoke('liftink:store-image', mime, base64),
  loadImage: (id: string): Promise<StoredImage> => ipcRenderer.invoke('liftink:load-image', id),
  captureScreen: (): Promise<CapturedScreen> => ipcRenderer.invoke('liftink:capture-screen'),
  pinImage: (id: string): Promise<void> => ipcRenderer.invoke('liftink:pin-image', id)
})
