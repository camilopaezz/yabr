import { app, BrowserWindow, shell, ipcMain, IpcMainInvokeEvent, Notification, dialog, net, protocol } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'child_process'
import { update } from './update'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const handleRemoveBackground = async (
  _e: IpcMainInvokeEvent,
  inputPath: string,
  outputPath: string,
  batch: boolean
): Promise<{
  resultPath: string
  consoleLog: string
}> => {
  const filename = path.parse(inputPath).name
  const resultPath = `${outputPath}/${filename}_bg.png`

  // p for batch processing, i for single image processing
  const args = [batch ? 'p' : 'i', inputPath, batch ? outputPath : resultPath]

  console.log(args.join(' '))

  const child = spawnSync('rembg', args)

  child.error?.message && console.error(child.error.message)

  new Notification({
    title: 'Background Removed',
    body: 'The background has been removed from the image.'
  }).show()

  return {
    resultPath,
    consoleLog: child.stdout?.toString() || ''
  }
}

const handleSelectInput = async (_e: IpcMainInvokeEvent, batch: boolean): Promise<string | undefined> => {
  if (batch) {
    const folder = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (folder.canceled) {
      return undefined
    }

    const folderPath = folder.filePaths[0]

    return folderPath
  }

  const files = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Image', extensions: ['jpg', 'png', 'webp', 'tif'] }]
  })

  if (files.canceled) {
    return undefined
  }

  const imagePath = files.filePaths[0]

  return imagePath
}

const handleSelectOutput = async (): Promise<string | undefined> => {
  const files = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })

  if (files.canceled) {
    return undefined
  }

  const outputPath = files.filePaths[0]

  return outputPath
}

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'atom', privileges: { bypassCSP: true, secure: true } }
])

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow () {
  win = new BrowserWindow({
    title: 'Yabr',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    autoHideMenuBar: true,
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    }
  })

  protocol.handle('atom', (request) => net.fetch('file://' + request.url.slice('atom:\\'.length)))

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win != null) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length > 0) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

ipcMain.handle('select-input', handleSelectInput)
ipcMain.handle('select-output', handleSelectOutput)
ipcMain.handle('remove-background', handleRemoveBackground)