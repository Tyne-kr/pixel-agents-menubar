import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — bridges Electron IPC → renderer's window message events.
 *
 * Messages are BUFFERED until the renderer registers its callback,
 * then all buffered messages are replayed. This prevents lost messages
 * when discovery fires before React mounts.
 */

type MessageCallback = (msg: Record<string, unknown>) => void;
let registeredCallback: MessageCallback | null = null;
const messageBuffer: Record<string, unknown>[] = [];

function dispatchMessage(msg: Record<string, unknown>) {
  if (registeredCallback) {
    registeredCallback(msg);
  } else {
    messageBuffer.push(msg);
  }
}

function setupIpcBridge(channel: string, msgType: string) {
  ipcRenderer.on(channel, (_event, data) => {
    // If data is an array (e.g., projects list), wrap it; otherwise spread it
    if (Array.isArray(data)) {
      dispatchMessage({ type: msgType, projects: data });
    } else {
      dispatchMessage({ type: msgType, ...(data || {}) });
    }
  });
}

// Map Electron IPC channels → original pixel-agents message types
setupIpcBridge('agent:added', 'agentCreated');
setupIpcBridge('agent:removed', 'agentClosed');
setupIpcBridge('agent:tool-start', 'agentToolStart');
setupIpcBridge('agent:tool-end', 'agentToolDone');
setupIpcBridge('agent:tools-clear', 'agentToolsClear');
setupIpcBridge('agent:status-changed', 'agentStatus');
setupIpcBridge('agent:permission', 'agentToolPermission');
setupIpcBridge('layout:loaded', 'layoutLoaded');
setupIpcBridge('assets:loaded', 'furnitureAssetsLoaded');
setupIpcBridge('projects:updated', 'projectsUpdated');
setupIpcBridge('window:mode-changed', 'windowModeChanged');
setupIpcBridge('auto-fit', 'fitToScreen');

contextBridge.exposeInMainWorld('pixelAgentsAPI', {
  // Register THE callback — replays all buffered messages immediately
  onMessage: (callback: MessageCallback) => {
    registeredCallback = callback;
    // Replay buffered messages
    while (messageBuffer.length > 0) {
      const msg = messageBuffer.shift()!;
      callback(msg);
    }
  },

  // Renderer → Main
  selectProject: (hash: string) => ipcRenderer.send('project:select', hash),
  toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
  saveLayout: (layout: unknown) => ipcRenderer.send('layout:save', layout),

  // Direct listeners for MenubarShell
  onProjectsUpdated: (callback: (data: unknown) => void) => {
    ipcRenderer.on('projects:updated', (_event, data) => callback(data));
  },
  onAgentAdded: (callback: (data: unknown) => void) => {
    ipcRenderer.on('agent:added', (_event, data) => callback(data));
  },
  onAgentRemoved: (callback: (data: unknown) => void) => {
    ipcRenderer.on('agent:removed', (_event, data) => callback(data));
  },
  onAgentToolStart: (callback: (data: unknown) => void) => {
    ipcRenderer.on('agent:tool-start', (_event, data) => callback(data));
  },
  onAgentToolEnd: (callback: (data: unknown) => void) => {
    ipcRenderer.on('agent:tool-end', (_event, data) => callback(data));
  },
  onAgentStatusChanged: (callback: (data: unknown) => void) => {
    ipcRenderer.on('agent:status-changed', (_event, data) => callback(data));
  },
  onWindowModeChanged: (callback: (mode: string) => void) => {
    ipcRenderer.on('window:mode-changed', (_event, mode) => callback(mode));
  },
});
