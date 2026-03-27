import { app, BrowserWindow, Tray, nativeImage, Menu, screen, protocol, net, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { AgentDiscovery } from './agentDiscovery';
import { FileWatcherManager } from './fileWatcherManager';
import { IpcBridge } from './ipcBridge';
import type { WindowMode } from '../src-shared/types';

// macOS menubar app: hide dock icon
if (process.platform === 'darwin') {
  app.dock.hide();
}

// Register custom protocol to serve webview files via HTTP-like URLs
// This allows fetch() in the renderer to load assets properly
protocol.registerSchemesAsPrivileged([
  { scheme: 'pixel-agents', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let windowMode: WindowMode = 'popover';
let agentDiscovery: AgentDiscovery | null = null;
let fileWatcherManager: FileWatcherManager | null = null;
let ipcBridge: IpcBridge | null = null;

// Actual visible office is ~304x224 pixels (aspect 1.36, wider than tall).
// Popover canvas = WIDTH × (HEIGHT - 70 bars) should match this ratio.
const POPOVER_WIDTH = 580;
const POPOVER_HEIGHT = 450;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the renderer via custom protocol (enables fetch for assets)
  win.loadURL('pixel-agents://app/index.html').catch(() => {
    // Dev mode: try vite dev server
    win.loadURL('http://localhost:5173').catch(console.error);
  });

  win.on('blur', () => {
    if (windowMode === 'popover') {
      win.hide();
    }
  });

  return win;
}

function getPopoverPosition(): { x: number; y: number } {
  if (!tray) return { x: 0, y: 0 };
  const trayBounds = tray.getBounds();
  const windowBounds = { width: POPOVER_WIDTH, height: POPOVER_HEIGHT };
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });

  const x = Math.round(
    trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2
  );
  const y = Math.round(trayBounds.y + trayBounds.height);

  // Keep within display bounds
  const maxX = display.bounds.x + display.bounds.width - windowBounds.width;
  const maxY = display.bounds.y + display.bounds.height - windowBounds.height;

  return {
    x: Math.min(Math.max(x, display.bounds.x), maxX),
    y: Math.min(y, maxY),
  };
}

function togglePopover(): void {
  if (!mainWindow) return;

  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    const pos = getPopoverPosition();
    mainWindow.setPosition(pos.x, pos.y, false);
    mainWindow.show();
    mainWindow.focus();
  }
}

function toggleFullscreen(): void {
  if (!mainWindow) return;

  if (windowMode === 'popover') {
    windowMode = 'fullscreen';
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setResizable(true);
    mainWindow.setFullScreenable(true);
    mainWindow.setFullScreen(true);

    // ESC key exits fullscreen
    globalShortcut.register('Escape', () => {
      if (mainWindow?.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
    });
  } else {
    windowMode = 'popover';
    globalShortcut.unregister('Escape');
    mainWindow.setFullScreen(false);
  }

  // Notify renderer of mode change
  mainWindow.webContents.send('window:mode-changed', windowMode);
}

function createTray(): void {
  // Try multiple paths for the tray icon
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'tray-iconTemplate.png'),
    path.join(app.getAppPath(), 'assets', 'tray-iconTemplate.png'),
    path.join(__dirname, 'assets', 'tray-iconTemplate.png'),
  ];

  let icon: nativeImage = nativeImage.createEmpty();
  for (const p of possiblePaths) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) {
        icon = img.resize({ width: 18, height: 18 });
        icon.setTemplateImage(true);
        break;
      }
    } catch {
      continue;
    }
  }

  // If all paths fail, create a simple colored icon so Tray is still visible
  if (icon.isEmpty()) {
    // 16x16 solid dot as fallback
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const cx = i % size - size / 2;
      const cy = Math.floor(i / size) - size / 2;
      if (cx * cx + cy * cy < (size / 3) * (size / 3)) {
        buf[i * 4] = 0;     // R
        buf[i * 4 + 1] = 0; // G
        buf[i * 4 + 2] = 0; // B
        buf[i * 4 + 3] = 255; // A
      }
    }
    icon = nativeImage.createFromBuffer(buf, { width: size, height: size });
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);
  tray.setToolTip('Pixel Agents');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide',
      click: togglePopover,
    },
    {
      label: 'Fullscreen',
      click: toggleFullscreen,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.on('click', togglePopover);
  tray.on('right-click', () => {
    tray?.popUpContextMenu(contextMenu);
  });
}

app.whenReady().then(() => {
  // Register protocol handler to serve webview files
  // This enables fetch() in the renderer to load assets (PNG sprites, JSON catalogs)
  const webviewDir = path.join(__dirname, '..', 'dist', 'webview');

  protocol.handle('pixel-agents', (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);

    // Remove leading slash
    if (filePath.startsWith('/')) filePath = filePath.slice(1);

    // All files served from dist/webview/
    const fullPath = path.join(webviewDir, filePath);

    if (fs.existsSync(fullPath)) {
      return net.fetch(`file://${fullPath}`);
    }

    console.log(`[protocol] 404: ${filePath}`);
    return new Response('Not found', { status: 404 });
  });

  createTray();
  mainWindow = createWindow();

  // Show window immediately on first launch so user can see it
  mainWindow.once('ready-to-show', () => {
    const pos = getPopoverPosition();
    mainWindow!.setPosition(pos.x, pos.y, false);
    mainWindow!.show();
    mainWindow!.focus();
  });

  // Initialize components but wait for webview to be ready before starting
  agentDiscovery = new AgentDiscovery();
  fileWatcherManager = new FileWatcherManager();
  ipcBridge = new IpcBridge(mainWindow, agentDiscovery, fileWatcherManager, toggleFullscreen);

  // Connect discovery → file watcher → IPC
  agentDiscovery.on('session-found', (session) => {
    fileWatcherManager?.watchSession(session);
  });

  agentDiscovery.on('session-ended', (sessionId) => {
    fileWatcherManager?.unwatchSession(sessionId);
  });

  fileWatcherManager.on('agent-message', (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(msg.channel, msg.data);
    }
  });

  agentDiscovery.on('projects-updated', (projects) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projects:updated', projects);
    }
  });

  // Start scanning AFTER webview is loaded so messages aren't lost
  mainWindow.webContents.on('did-finish-load', () => {
    agentDiscovery!.startScanning();

    // Auto-fit after initial load (delay for React + browserMock to finish)
    setTimeout(() => {
      mainWindow?.webContents.send('auto-fit', {});
    }, 1500);
  });

  // Auto-fit when entering/leaving fullscreen
  mainWindow.on('enter-full-screen', () => {
    windowMode = 'fullscreen';
    mainWindow?.webContents.send('window:mode-changed', 'fullscreen');
    // Delay fit to allow resize to complete
    setTimeout(() => {
      mainWindow?.webContents.send('auto-fit', {});
    }, 300);
  });

  mainWindow.on('leave-full-screen', () => {
    windowMode = 'popover';
    globalShortcut.unregister('Escape');
    mainWindow?.webContents.send('window:mode-changed', 'popover');
    // Restore popover size and position
    mainWindow!.setAlwaysOnTop(true);
    mainWindow!.setResizable(false);
    mainWindow!.setSize(POPOVER_WIDTH, POPOVER_HEIGHT, true);
    const pos = getPopoverPosition();
    mainWindow!.setPosition(pos.x, pos.y, false);
    // Auto-fit after resize
    setTimeout(() => {
      mainWindow?.webContents.send('auto-fit', {});
    }, 300);
  });

  // Also auto-fit on window resize (e.g., user drags window edge in fullscreen)
  mainWindow.on('resize', () => {
    if (windowMode === 'fullscreen') {
      mainWindow?.webContents.send('auto-fit', {});
    }
  });
});

// macOS: keep app running when all windows closed
app.on('window-all-closed', () => {
  // Do nothing — menubar app stays alive
});

app.on('activate', () => {
  if (!mainWindow) {
    mainWindow = createWindow();
  }
});

// Cleanup on quit
app.on('before-quit', () => {
  agentDiscovery?.stopScanning();
  fileWatcherManager?.unwatchAll();
});

// Handle sleep/wake
const { powerMonitor } = require('electron');
powerMonitor.on('resume', () => {
  agentDiscovery?.rescan();
  fileWatcherManager?.restartAll();
});

export { toggleFullscreen };
