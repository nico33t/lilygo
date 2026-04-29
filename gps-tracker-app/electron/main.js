const { app, BrowserWindow, shell } = require('electron')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const path = require('path')

const isDev = !app.isPackaged
const BLE_BRIDGE_PORT = 8765
const APP_SERVER_PORT = 8766

let bridgeProcess = null
let appServer = null

// ── Static file server for the Expo web bundle ───────────────────────────────
// loadFile() breaks with Expo's absolute asset paths (/_expo/static/...).
// Serving dist/ over HTTP avoids all path-resolution issues.

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
}

function startAppServer(distDir) {
  appServer = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url)

    // Strip query strings
    filePath = filePath.split('?')[0]

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // SPA fallback
      filePath = path.join(distDir, 'index.html')
    }

    const ext = path.extname(filePath)
    const mime = MIME[ext] || 'application/octet-stream'

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      res.writeHead(200, { 'Content-Type': mime })
      res.end(data)
    })
  })

  appServer.listen(APP_SERVER_PORT)
}

// ── BLE bridge (Python) ──────────────────────────────────────────────────────

function startBleBridge() {
  const script = path.join(__dirname, 'ble_bridge.py')
  bridgeProcess = spawn('python3', [script, String(BLE_BRIDGE_PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  bridgeProcess.stdout.on('data', (d) => process.stdout.write(`[ble_bridge] ${d}`))
  bridgeProcess.stderr.on('data', (d) => process.stderr.write(`[ble_bridge] ${d}`))
  bridgeProcess.on('exit', (code) => {
    console.log(`[ble_bridge] exited with code ${code}`)
    bridgeProcess = null
  })
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    title: 'GPS Tracker',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.setMenuBarVisibility(false)

  if (isDev) {
    win.loadURL('http://localhost:8081')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadURL(`http://localhost:${APP_SERVER_PORT}`)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const distDir = path.join(__dirname, '..', 'dist')
  startAppServer(distDir)
  startBleBridge()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

function cleanup() {
  if (bridgeProcess) { bridgeProcess.kill(); bridgeProcess = null }
  if (appServer) { appServer.close(); appServer = null }
}

app.on('window-all-closed', () => {
  cleanup()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', cleanup)
