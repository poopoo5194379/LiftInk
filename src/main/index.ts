import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, nativeImage, screen } from 'electron'
import { basename, extname, join } from 'path'
import { createHash } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { CapturedScreen, StoredImage } from '../shared/editor'
import { NoteStore } from './storage'

const assetIdPattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/
const storageRoot = (): string =>
  process.env['LIFTINK_TEST_DATA_DIR'] ?? join(app.getPath('userData'), 'liftink-data')
const noteStore = new NoteStore(storageRoot)
const assetPath = (id: string): string => join(storageRoot(), 'assets', id)
function imageMime(id: string): string {
  return id.endsWith('.jpg') ? 'image/jpeg' : id.endsWith('.webp') ? 'image/webp' : 'image/png'
}
async function loadImage(id: string): Promise<StoredImage> {
  if (!assetIdPattern.test(id)) throw new Error('无效的图片资源')
  const bytes = await readFile(assetPath(id))
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
  await mkdir(join(storageRoot(), 'assets'), { recursive: true })
  await writeFile(assetPath(id), bytes)
  return { assetId: id, dataUrl: `data:${mime};base64,${base64}` }
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  let closeAllowed = false
  let closeCheckRunning = false
  mainWindow.on('close', (event) => {
    if (closeAllowed || !noteStore.hasUnfinishedWork()) return
    event.preventDefault()
    if (closeCheckRunning) return
    closeCheckRunning = true
    void noteStore
      .flush()
      .then(
        () => {
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
          }
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
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('liftink:choose-imports', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner.isDestroyed()) return []
    const result = await dialog.showOpenDialog(owner, {
      title: '导入 PDF 或图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 与图片', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled) return []
    return result.filePaths.slice(0, 10).flatMap((path) => {
      const extension = extname(path).toLowerCase()
      if (!['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return []
      return [{ name: basename(path), kind: extension === '.pdf' ? 'pdf' : 'image' }]
    })
  })

  ipcMain.handle('liftink:load-note-index', () => noteStore.loadIndex())
  ipcMain.handle('liftink:save-note-index', (_event, notes: unknown) => noteStore.saveIndex(notes))
  ipcMain.handle('liftink:load-document', (_event, id: unknown) => noteStore.loadDocument(id))
  ipcMain.handle('liftink:save-document', (_event, document: unknown) =>
    noteStore.saveDocument(document)
  )
  ipcMain.handle('liftink:store-image', async (_event, mime: unknown, base64: unknown) => {
    if (typeof mime !== 'string' || typeof base64 !== 'string') throw new Error('无效的图片数据')
    return storeImage(mime, base64)
  })
  ipcMain.handle('liftink:load-image', async (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('无效的图片资源')
    return loadImage(id)
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
  ipcMain.handle('liftink:pin-image', async (_event, id: unknown): Promise<void> => {
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
