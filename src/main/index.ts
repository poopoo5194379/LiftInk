import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, nativeImage, Notification, screen, shell, Tray } from 'electron'
import { basename, extname, isAbsolute, join } from 'path'
import { createHash, randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { open, readFile, readdir, realpath, stat, unlink } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { MAX_PDF_BYTES } from '../shared/editor'
import type { AppDiagnostics, CapturedScreen, OpenedPdf, StoredImage, StoredMedia } from '../shared/editor'
import { NoteStore, replaceAtomic, validDocument, validNoteId, validNoteRecord } from './storage'
import { loadNativePdfText, loadPdfOcr, recognizeInk, recognizePdfPage, saveNativePdfText, savePdfOcr } from './pdfOcr'
import { copyVault, createVault, independentParent, loadVaultSettings, readVault, saveVaultSettings, seedVault, verifyVault } from './vault'
import type { VaultOperation } from '../shared/vault'

const assetIdPattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/
const mediaIdPattern = /^[a-f0-9]{64}\.(pdf|webm)$/
const defaultStorageRoot = (): string =>
  process.env['LIFTINK_TEST_DATA_DIR'] ?? join(app.getPath('userData'), 'liftink-data')
let selectedVault: { path: string; id: string } | null = null
let vaultError: Error | null = null
const selectionPath = (): string => join(app.getPath('userData'), 'active-vault.json')
const storageRoot = (): string => selectedVault?.path ?? defaultStorageRoot()
let noteStore = new NoteStore(storageRoot)
const assetPath = (id: string): string => join(storageRoot(), 'assets', id)
let primaryWindow: BrowserWindow | null = null
let tray: Tray | null = null
let closeToTray = false
let quitting = false
const backupDirectoryFile = (): string => join(app.getPath('userData'), 'backup-directory.json')
const backupDirectory = async (): Promise<string | null> => {
  const directory = await readFile(backupDirectoryFile(), 'utf8').catch(() =>
    readFile(join(defaultStorageRoot(), 'backup-directory.json'), 'utf8').catch(() => ''))
  return isAbsolute(directory) ? directory : null
}
let vaultOperationRunning = false
let vaultBarrier: Promise<void> | null = null
let vaultGeneration = 0
const activeVaultCalls = new Set<Promise<unknown>>()

function handleVault(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (event.sender !== primaryWindow?.webContents) throw new Error('资料库窗口已关闭')
    const generation = vaultGeneration
    if (vaultBarrier) await vaultBarrier
    if (generation !== vaultGeneration) throw new Error('资料库已切换')
    const call = (async () => {
      if (vaultError && channel === 'liftink:load-vault-settings') {
        await loadActiveVault()
        vaultError = null
      }
      if (vaultError) throw vaultError
      if (selectedVault && (await readVault(selectedVault.path)).id !== selectedVault.id) throw new Error('资料库标识已变化')
      return handler(event, ...args)
    })()
    activeVaultCalls.add(call)
    try { return await call } finally { activeVaultCalls.delete(call) }
  })
}

async function loadActiveVault(): Promise<void> {
  const data = await readFile(selectionPath(), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (data === null) { selectedVault = null; return }
  const selection = JSON.parse(data) as typeof selectedVault
  if (!selection || typeof selection.path !== 'string' || !isAbsolute(selection.path) || typeof selection.id !== 'string') {
    throw new Error('当前资料库路径配置无效，请重新打开资料库')
  }
  selectedVault = selection
  if ((await readVault(selection.path)).id !== selection.id) throw new Error('当前资料库不可用，请重新打开资料库')
}

async function runVaultOperation(window: BrowserWindow, operation: VaultOperation, automatic: boolean): Promise<string | null> {
  if (vaultOperationRunning) throw new Error('已有资料库操作正在进行')
  vaultOperationRunning = true
  let release: (() => void) | undefined
  let switching = false
  try {
    const select = async (title: string): Promise<string | null> => {
      const result = await dialog.showOpenDialog(window, { title, properties: ['openDirectory', 'createDirectory'] })
      return result.canceled || !result.filePaths[0] ? null : realpath(result.filePaths[0])
    }
    if (vaultError && (operation === 'snapshot' || operation === 'migrate')) throw vaultError
    const active = storageRoot()
    const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')
    let source = active
    let destination: string | null
    if (operation === 'open') destination = await select('打开 LiftInk 资料库文件夹')
    else if (operation === 'snapshot') {
      const parent = (await backupDirectory()) ?? (automatic ? null : await select('选择独立的快照备份目录'))
      destination = parent ? join(await independentParent(active, parent), `LiftInk-快照-${timestamp}-${randomUUID().slice(0, 8)}`) : null
    } else {
      if (operation === 'restore') {
        const snapshot = await select('选择包含备份清单的快照文件夹')
        if (!snapshot) return null
        source = snapshot
      }
      const title = operation === 'restore' ? '选择恢复后资料库的上级目录'
        : operation === 'migrate' ? '更改存储位置：选择 LiftInk-资料库 的上级文件夹'
        : '选择新资料库的上级目录'
      const parent = await select(title)
      destination = parent ? join(await independentParent(active, await independentParent(source, parent)),
        operation === 'restore' ? `LiftInk-恢复-${timestamp}` : 'LiftInk-资料库') : null
    }
    if (!destination) return null
    vaultBarrier = new Promise<void>((resolve) => { release = resolve })
    await Promise.allSettled([...activeVaultCalls])
    if (!vaultError) await noteStore.flush()
    if (operation === 'create') await createVault(destination)
    else if (operation !== 'open') await copyVault(source, destination, operation)
    if (operation === 'snapshot') return destination
    const manifest = operation === 'open' ? await verifyVault(destination) : await readVault(destination)
    const next = { path: destination, id: manifest.id }
    await replaceAtomic(selectionPath(), JSON.stringify(next))
    const applySelection = (event: { isMainFrame: boolean; isSameDocument: boolean }): void => {
      if (!event.isMainFrame || event.isSameDocument) return
      window.webContents.removeListener('did-start-navigation', applySelection)
      selectedVault = next
      vaultError = null
      noteStore = new NoteStore(storageRoot)
      vaultGeneration++
      vaultBarrier = null
      vaultOperationRunning = false
      release?.()
    }
    window.webContents.on('did-start-navigation', applySelection)
    switching = true
    setImmediate(() => { if (!window.isDestroyed()) window.webContents.reload() })
    return destination
  } finally {
    if (!switching) {
      vaultBarrier = null
      vaultOperationRunning = false
      release?.()
    }
  }
}
async function directorySize(directory: string): Promise<number> {
  let bytes = 0
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) bytes += await directorySize(path)
    else if (entry.isFile()) bytes += (await stat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    }))?.size ?? 0
  }
  return bytes
}

function showTray(window: BrowserWindow): void {
  const show = (): void => { window.show(); window.focus() }
  if (!tray) {
    tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 32, height: 32 }))
    tray.setToolTip('LiftInk')
    tray.on('click', show)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开 LiftInk', click: show },
      { label: '退出应用', click: () => { app.quit() } }
    ]))
  }
  window.hide()
}

app.on('before-quit', () => { quitting = true })
const pendingPdfPaths: string[] = []

function validPdfOpenPath(path: unknown): string | null {
  return typeof path === 'string' && isAbsolute(path) && extname(path).toLowerCase() === '.pdf'
    ? path
    : null
}

function pdfOpenArgument(args: string[]): string | null {
  const flag = args.indexOf('--open-pdf')
  return flag >= 0 ? validPdfOpenPath(args[flag + 1]) : null
}

async function readOpenedPdf(path: string): Promise<OpenedPdf> {
  try {
    const file = await open(path, 'r')
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size < 5 || info.size > MAX_PDF_BYTES)
        return { error: '请选择有效且不超过 120 MB 的 PDF 文件' }
      const bytes = new Uint8Array(info.size)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
        if (!bytesRead) return { error: 'PDF 在读取期间发生变化，请重新打开' }
        offset += bytesRead
      }
      if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-')
        return { error: 'PDF 内容无效' }
      return { name: basename(path), bytes }
    } finally {
      await file.close()
    }
  } catch {
    return { error: '无法读取 PDF，请确认文件仍在原位置并且有读取权限' }
  }
}
function imageMime(id: string): string {
  return id.endsWith('.jpg') ? 'image/jpeg' : id.endsWith('.webp') ? 'image/webp' : 'image/png'
}
async function loadImage(id: string): Promise<StoredImage> {
  if (!assetIdPattern.test(id)) throw new Error('无效的图片资源')
  const bytes = await readFile(assetPath(id))
  if (createHash('sha256').update(bytes).digest('hex') !== id.slice(0, 64))
    throw new Error('图片资源内容损坏')
  return { assetId: id, dataUrl: `data:${imageMime(id)};base64,${bytes.toString('base64')}` }
}
function isImageBytes(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/png')
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/webp')
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return false
}
async function storeImage(mime: string, base64: string): Promise<StoredImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) || base64.length > 28_000_000)
    throw new Error('不支持的图片格式或文件过大')
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0 || bytes.length > 20_000_000 || !isImageBytes(bytes, mime))
    throw new Error('图片内容无效')
  const decoded = nativeImage.createFromBuffer(bytes)
  const size = decoded.getSize()
  if (decoded.isEmpty() || size.width > 12000 || size.height > 12000)
    throw new Error('图片尺寸过大或无法解码')
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]
  const id = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
  const path = assetPath(id)
  let existing: Buffer | null = null
  try {
    existing = await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (existing && !existing.equals(bytes))
    await replaceAtomic(`${path}.corrupt-${randomUUID()}`, existing)
  if (!existing || !existing.equals(bytes)) await replaceAtomic(path, bytes)
  return { assetId: id, dataUrl: `data:${mime};base64,${base64}` }
}

async function storeMediaBytes(mime: string, bytes: Buffer): Promise<string> {
  if (!['application/pdf', 'audio/webm'].includes(mime) ||
      !bytes.length || bytes.length > (mime === 'application/pdf' ? MAX_PDF_BYTES : 50_000_000)) throw new Error('资料文件格式无效或过大')
  if (mime === 'application/pdf' && bytes.toString('ascii', 0, 5) !== '%PDF-') throw new Error('PDF 内容无效')
  if (mime === 'audio/webm' && !bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) throw new Error('录音内容无效')
  const id = `${createHash('sha256').update(bytes).digest('hex')}.${mime === 'application/pdf' ? 'pdf' : 'webm'}`
  const path = assetPath(id)
  try {
    const previous = await readFile(path)
    if (!previous.equals(bytes)) throw new Error('资料哈希冲突')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await replaceAtomic(path, bytes)
  }
  return id
}

async function storeMedia(mime: string, base64: string): Promise<StoredMedia> {
  if (base64.length > 4 * Math.ceil((mime === 'application/pdf' ? MAX_PDF_BYTES : 50_000_000) / 3)) throw new Error('资料文件过大')
  const assetId = await storeMediaBytes(mime, Buffer.from(base64, 'base64'))
  return { assetId, dataUrl: `data:${mime};base64,${base64}` }
}

async function loadMedia(id: string): Promise<StoredMedia> {
  if (!mediaIdPattern.test(id)) throw new Error('无效的资料资源')
  const bytes = await readFile(assetPath(id))
  if (createHash('sha256').update(bytes).digest('hex') !== id.slice(0, 64)) throw new Error('资料资源内容损坏')
  return { assetId: id, dataUrl: `data:${id.endsWith('.pdf') ? 'application/pdf' : 'audio/webm'};base64,${bytes.toString('base64')}` }
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  primaryWindow = mainWindow
  mainWindow.on('closed', () => {
    if (primaryWindow === mainWindow) primaryWindow = null
    tray?.destroy()
    tray = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  let closeAllowed = false
  let closeCheckRunning = false
  const flushRenderer = (): Promise<void> => new Promise((resolve, reject) => {
    const request = randomUUID()
    const contents = mainWindow.webContents
    const finish = (saved: boolean): void => {
      clearTimeout(timeout)
      ipcMain.removeListener('liftink:prepared-close', acknowledge)
      if (saved) resolve()
      else reject(new Error('渲染窗口尚有未保存的笔记'))
    }
    const acknowledge = (event: Electron.IpcMainEvent, response: unknown, saved: unknown): void => {
      if (event.sender === contents && response === request) finish(saved === true)
    }
    const timeout = setTimeout(() => finish(false), 10_000)
    ipcMain.on('liftink:prepared-close', acknowledge)
    contents.send('liftink:prepare-close', request)
  })
  mainWindow.on('close', (event) => {
    if (closeAllowed || mainWindow.webContents.isCrashed()) return
    event.preventDefault()
    if (vaultOperationRunning) return
    if (closeCheckRunning) return
    closeCheckRunning = true
    void flushRenderer()
      .then(() => noteStore.flush())
      .then(
        () => {
          if (closeToTray && !quitting) {
            if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false)
            showTray(mainWindow)
            return
          }
          closeAllowed = true
          mainWindow.close()
        },
        async () => {
          if (mainWindow.isDestroyed()) return
          const choice = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'LiftInk 保存未完成',
            message: '有笔记或目录未能保存',
            detail: '继续编辑可检查保存状态并重试。仍要退出可能丢失本次尚未保存的修改。',
            buttons: ['继续编辑', '仍要退出'],
            defaultId: 0,
            cancelId: 0,
            noLink: true
          })
          if (choice.response === 1) {
            closeAllowed = true
            mainWindow.close()
          } else quitting = false
        }
      )
      .finally(() => {
        closeCheckRunning = false
      })
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
const initialPdfPath = process.platform === 'win32' ? pdfOpenArgument(process.argv) : null
const useInstanceLock = process.platform === 'win32' && app.isPackaged
const testDataRoot = process.env['LIFTINK_TEST_DATA_DIR']
if (testDataRoot) {
  const profile = join(testDataRoot, '.electron-profile')
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
} else {
  // Keep the existing library and Chromium preferences after renaming the app.
  const profile = join(app.getPath('appData'), 'liftink-desktop')
  mkdirSync(profile, { recursive: true })
  app.setPath('userData', profile)
}
app.setName('LiftInk')
const hasInstanceLock = !useInstanceLock || app.requestSingleInstanceLock({ pdfPath: initialPdfPath })
if (!hasInstanceLock) app.quit()
if (hasInstanceLock && initialPdfPath) pendingPdfPaths.push(initialPdfPath)

if (useInstanceLock && hasInstanceLock) {
  app.on('second-instance', (_event, _args, _cwd, data: unknown) => {
    const path = data && typeof data === 'object' && 'pdfPath' in data
      ? validPdfOpenPath(data.pdfPath)
      : null
    if (path) pendingPdfPaths.push(path)
    if (!primaryWindow) return
    if (primaryWindow.isMinimized()) primaryWindow.restore()
    primaryWindow.show()
    primaryWindow.focus()
    if (path) primaryWindow.webContents.send('liftink:pdf-open-available')
  })
}

if (hasInstanceLock) void app.whenReady().then(async () => {
  await loadActiveVault().catch((error: unknown) => { vaultError = error instanceof Error ? error : new Error(String(error)) })
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  handleVault('liftink:load-note-index', () => noteStore.loadIndex())
  handleVault('liftink:load-vault-settings', async () => {
    const settings = await loadVaultSettings(storageRoot())
    if (selectedVault && !settings) throw new Error('资料库配置缺失，请从完整快照恢复')
    if (!selectedVault && settings) await seedVault(storageRoot(), settings)
    return settings
  })
  handleVault('liftink:seed-vault-settings', (_event, settings: unknown) => {
    if (selectedVault) throw new Error('此资料库已初始化')
    return seedVault(storageRoot(), settings)
  })
  handleVault('liftink:save-vault-settings', (_event, settings: unknown) => saveVaultSettings(storageRoot(), settings))
  handleVault('liftink:vault-identity', async () => JSON.stringify([storageRoot(), (await readVault(storageRoot())).id]))
  ipcMain.handle('liftink:vault-operation', (event, operation: unknown, automatic: unknown) => {
    if (!primaryWindow || event.sender !== primaryWindow.webContents || typeof operation !== 'string' ||
        !['open', 'create', 'migrate', 'snapshot', 'restore'].includes(operation)) throw new Error('资料库操作无效')
    return runVaultOperation(primaryWindow, operation as VaultOperation, automatic === true)
  })
  ipcMain.handle('liftink:apply-window-preferences', (event, scale: unknown, toTray: unknown) => {
    if (event.sender !== primaryWindow?.webContents || typeof scale !== 'number' || !Number.isFinite(scale) || scale < 90 || scale > 125 || typeof toTray !== 'boolean') return
    event.sender.setZoomFactor(scale / 100)
    closeToTray = toTray
  })
  handleVault('liftink:storage-info', async () => ({ path: storageRoot(), bytes: await directorySize(storageRoot()), backupDirectory: await backupDirectory() }))
  handleVault('liftink:open-storage-directory', async () => {
    mkdirSync(storageRoot(), { recursive: true })
    const error = await shell.openPath(storageRoot())
    if (error) throw new Error(error)
  })
  handleVault('liftink:choose-backup-directory', async (event) => {
    if (!primaryWindow || event.sender !== primaryWindow.webContents) return null
    const result = await dialog.showOpenDialog(primaryWindow, { title: '选择备份目录', properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    mkdirSync(storageRoot(), { recursive: true })
    await replaceAtomic(backupDirectoryFile(), path)
    return path
  })
  handleVault('liftink:write-library-backup', async (event, data: unknown) => {
    if (event.sender !== primaryWindow?.webContents || typeof data !== 'string' || data.length > 228_000_000) throw new Error('备份数据无效或过大')
    const directory = await backupDirectory()
    if (!directory) throw new Error('请选择备份目录')
    const bytes = Buffer.from(data, 'base64')
    if (bytes.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('备份格式无效')
    const path = join(directory, `LiftInk-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.liftink`)
    await replaceAtomic(path, bytes)
    return path
  })
  ipcMain.handle('liftink:app-diagnostics', (): AppDiagnostics => ({
    version: app.getVersion(), electron: process.versions.electron, chromium: process.versions.chrome,
    platform: process.platform, arch: process.arch, gpu: app.getGPUFeatureStatus().gpu_compositing
  }))
  ipcMain.handle('liftink:validate-note-record', (_event, note: unknown) => validNoteRecord(note))
  handleVault('liftink:clean-assets', (_event, ids: unknown) => noteStore.cleanAssets(ids))
  handleVault('liftink:sweep-trash', () => noteStore.sweepTrash())
  ipcMain.handle('liftink:notify-agenda', (event, title: unknown, due: unknown) => {
    if (event.sender !== primaryWindow?.webContents || typeof title !== 'string' || !title.trim() || title.length > 100 ||
        typeof due !== 'number' || !Number.isFinite(due) || Math.abs(Date.now() - due) > 90_000 || !Notification.isSupported()) return false
    new Notification({ title: 'LiftInk 日程提醒', body: title }).show()
    return true
  })
  ipcMain.handle('liftink:take-opened-pdf', (event) => {
    if (!primaryWindow || event.sender !== primaryWindow.webContents) return null
    const path = pendingPdfPaths.shift()
    return path ? readOpenedPdf(path) : null
  })
  handleVault('liftink:save-note-index', (_event, notes: unknown) => noteStore.saveIndex(notes))
  handleVault('liftink:initialize-note', (_event, note: unknown, initial?: unknown) =>
    noteStore.initializeNote(note, initial)
  )
  handleVault('liftink:load-document', (_event, id: unknown) => noteStore.loadDocument(id))
  handleVault('liftink:save-pdf-ocr', (_event, id: unknown, page: unknown, result: unknown) => savePdfOcr(storageRoot(), id, page, result))
  handleVault('liftink:load-pdf-ocr', (_event, id: unknown, page: unknown) =>
    loadPdfOcr(storageRoot(), id, page))
  handleVault('liftink:load-native-pdf-text', (_event, id: unknown) => loadNativePdfText(storageRoot(), id))
  handleVault('liftink:save-native-pdf-text', (_event, id: unknown, pages: unknown) => saveNativePdfText(storageRoot(), id, pages))
  handleVault('liftink:recognize-ink', (_event, image: unknown) => recognizeInk(storageRoot(), image))
  handleVault('liftink:recognize-pdf-page', (_event, id: unknown, page: unknown, image: unknown, width: unknown, height: unknown, refresh: unknown) =>
    recognizePdfPage(storageRoot(), id, page, image, width, height, refresh))
  handleVault('liftink:save-document', (_event, document: unknown) =>
    noteStore.saveDocument(document)
  )
  ipcMain.handle('liftink:validate-document', (_event, document: unknown) => {
    const id = (document as { noteId?: unknown } | null)?.noteId
    return validNoteId(id) && validDocument(document, id)
  })
  handleVault('liftink:store-image', async (_event, mime: unknown, base64: unknown) => {
    if (typeof mime !== 'string' || typeof base64 !== 'string') throw new Error('无效的图片数据')
    return storeImage(mime, base64)
  })
  handleVault('liftink:load-image', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的图片资源')
    return loadImage(id)
  })
  handleVault('liftink:store-pdf-source', (_event, bytes: unknown) => {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_PDF_BYTES) throw new Error('PDF 数据无效或过大')
    return storeMediaBytes('application/pdf', Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
  })
  handleVault('liftink:read-pdf-source', async (_event, id: unknown) => {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}\.pdf$/.test(id)) throw new Error('PDF 来源无效')
    const bytes = await readFile(assetPath(id))
    if (bytes.length > MAX_PDF_BYTES || createHash('sha256').update(bytes).digest('hex') !== id.slice(0, 64))
      throw new Error('PDF 来源文件损坏或过大')
    return new Uint8Array(bytes)
  })
  handleVault('liftink:store-media', async (_event, mime: unknown, base64: unknown) => {
    if (typeof mime !== 'string' || typeof base64 !== 'string') throw new Error('无效的资料数据')
    return storeMedia(mime, base64)
  })
  handleVault('liftink:load-media', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的资料资源')
    return loadMedia(id)
  })
  ipcMain.handle('liftink:save-export', async (event, kind: unknown, filename: unknown, base64: unknown) => {
    if (typeof kind !== 'string' || !['pdf', 'png', 'zip', 'liftink', 'json', 'md'].includes(kind) || typeof filename !== 'string' || typeof base64 !== 'string' || base64.length > 228_000_000) throw new Error('导出数据无效')
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('窗口已关闭')
    const safeName = filename.replace(/[<>:"/\\|?*]/g, '_').split('').map((char) => char.charCodeAt(0) < 32 ? '_' : char).join('').slice(0, 100) || 'LiftInk'
    const result = await dialog.showSaveDialog(owner, { title: kind === 'json' ? '保存笔迹采样' : '导出 LiftInk 笔记', defaultPath: `${safeName}.${kind}`, filters: [{ name: kind.toUpperCase(), extensions: [kind] }] })
    if (result.canceled || !result.filePath) return null
    const bytes = Buffer.from(base64, 'base64')
    if (!bytes.length || bytes.length > (kind === 'json' ? 2_000_000 : 170_000_000)) throw new Error('导出文件过大')
    await replaceAtomic(result.filePath, bytes)
    return result.filePath
  })
  handleVault('liftink:export-markdown-pdf', async (event, title: unknown, content: unknown) => {
    if (typeof title !== 'string' || title.length > 10_000 || typeof content !== 'string' || content.length > 72_000_000) throw new Error('导出数据无效')
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) throw new Error('窗口已关闭')
    const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'LiftInk'
    const { canceled, filePath } = await dialog.showSaveDialog(owner, {
      title: '导出 Markdown 笔记为 PDF', defaultPath: `${safeTitle}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null
    const temp = join(storageRoot(), '.exports', `${randomUUID()}.html`)
    const escapedTitle = title.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]!)
    const policy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>
      @page{size:A4;margin:18mm} body{margin:0;color:#252638;font:11pt/1.6 'Microsoft YaHei UI','PingFang SC',sans-serif;overflow-wrap:anywhere}
      h1,h2,h3,h4,h5,h6{break-after:avoid;line-height:1.3;margin:.85em 0 .4em} .title{margin-top:0;font-size:25pt}
      p{margin:0 0 .65em} blockquote{margin-left:0;padding-left:1em;border-left:3px solid #b19bd8} img{display:block;max-width:100%;max-height:235mm;object-fit:contain;break-inside:avoid;margin:.75em auto}
      pre{white-space:pre-wrap} hr{border:0;border-top:1px solid #ddd} </style><h1 class="title">${escapedTitle}</h1><main>${content}</main></html>`
    const print = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } })
    print.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    print.webContents.on('will-navigate', (navigation) => navigation.preventDefault())
    try {
      await replaceAtomic(temp, html)
      await print.loadFile(temp)
      const bytes = await print.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true })
      await replaceAtomic(filePath, bytes)
      return filePath
    } finally {
      print.destroy()
      await unlink(temp).catch(() => undefined)
    }
  })
  ipcMain.handle('liftink:capture-screen', async (): Promise<CapturedScreen> => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const width = Math.round(display.bounds.width * display.scaleFactor)
    const height = Math.round(display.bounds.height * display.scaleFactor)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })
    const source = sources.find((item) => item.display_id === String(display.id))
    if (!source || source.thumbnail.isEmpty()) throw new Error('无法取得当前显示器画面')
    const image = source.thumbnail
    const size = image.getSize()
    return {
      dataUrl: image.toDataURL(),
      width: size.width,
      height: size.height,
      label: display.label || '当前屏幕'
    }
  })
  handleVault('liftink:pin-image', async (_event, id: unknown): Promise<void> => {
    if (typeof id !== 'string') throw new Error('无效的图片资源')
    const image = await loadImage(id)
    const pin = new BrowserWindow({
      title: 'LiftInk 贴图',
      width: 520,
      height: 380,
      minWidth: 180,
      minHeight: 140,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    pin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await pin.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;width:100%;height:100%;background:#fff}img{width:100%;height:100%;object-fit:contain}</style></head><body><img src="${image.dataUrl}" alt="LiftInk 贴图"></body></html>`)}`
    )
    pin.setAlwaysOnTop(true)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
