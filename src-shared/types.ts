/**
 * Shared types for Pixel Agents Menubar.
 * Replaces vscode.Terminal/vscode.Webview with platform-agnostic interfaces.
 */

/** Replaces vscode.Webview — anything that can receive messages */
export interface MessagePort {
  postMessage(msg: unknown): void;
}

/** Agent state without terminal binding (read-only observer model) */
export interface AgentState {
  id: number;
  jsonlFile: string;
  projectDir: string;
  fileOffset: number;
  lineBuffer: string;
  activeToolIds: Set<string>;
  activeToolStatuses: Map<string, string>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  lastDataAt: number;
  linesProcessed: number;
  seenUnknownRecordTypes: Set<string>;
}

/** Persisted agent info (for restoring across app restarts) */
export interface PersistedAgent {
  id: number;
  jsonlFile: string;
  projectDir: string;
  folderName: string;
}

/** Discovered project from ~/.claude/projects/ */
export interface DiscoveredProject {
  hash: string;
  path: string;
  lastModified: number;
  sessions: DiscoveredSession[];
}

/** Discovered JSONL session file */
export interface DiscoveredSession {
  sessionId: string;
  jsonlPath: string;
  lastModified: number;
  isActive: boolean;
}

/** IPC channel names */
export const IPC_CHANNELS = {
  // Main → Renderer
  AGENT_TOOL_START: 'agent:tool-start',
  AGENT_TOOL_END: 'agent:tool-end',
  AGENT_STATUS_CHANGED: 'agent:status-changed',
  AGENT_ADDED: 'agent:added',
  AGENT_REMOVED: 'agent:removed',
  AGENT_PERMISSION: 'agent:permission',
  LAYOUT_LOADED: 'layout:loaded',
  ASSETS_LOADED: 'assets:loaded',
  PROJECTS_UPDATED: 'projects:updated',

  // Renderer → Main
  SELECT_PROJECT: 'project:select',
  TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  SAVE_LAYOUT: 'layout:save',
  REQUEST_ASSETS: 'assets:request',
} as const;

/** Message payload for agent tool events */
export interface AgentToolMessage {
  agentId: number;
  toolId: string;
  toolName: string;
  status: string;
}

/** Window mode */
export type WindowMode = 'popover' | 'fullscreen';
