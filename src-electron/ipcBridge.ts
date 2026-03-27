import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import type { AgentDiscovery } from './agentDiscovery';
import type { FileWatcherManager } from './fileWatcherManager';

export class IpcBridge {
  private window: BrowserWindow;
  private discovery: AgentDiscovery;
  private fileWatcher: FileWatcherManager;
  private onToggleFullscreen: () => void;

  constructor(
    window: BrowserWindow,
    discovery: AgentDiscovery,
    fileWatcher: FileWatcherManager,
    onToggleFullscreen: () => void
  ) {
    this.window = window;
    this.discovery = discovery;
    this.fileWatcher = fileWatcher;
    this.onToggleFullscreen = onToggleFullscreen;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    ipcMain.on('project:select', (_event, hash: string) => {
      this.discovery.selectProject(hash);
    });

    ipcMain.on('window:toggle-fullscreen', () => {
      this.onToggleFullscreen();
    });

    ipcMain.on('layout:save', (_event, layout: unknown) => {
      // Forward to layout persistence (to be connected)
      console.log('Layout save requested', layout);
    });

    ipcMain.on('assets:request', () => {
      // Forward to asset loader (to be connected)
      console.log('Assets requested');
    });

    // Handle VS Code-style messages from the compatibility bridge
    ipcMain.on('vscode:exportLayout', (_event, msg: Record<string, unknown>) => {
      console.log('Export layout via vscode compat:', msg);
    });

    ipcMain.on('vscode:importLayout', (_event, msg: Record<string, unknown>) => {
      console.log('Import layout via vscode compat:', msg);
    });
  }

  updateWindow(window: BrowserWindow): void {
    this.window = window;
  }
}
