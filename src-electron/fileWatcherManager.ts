import { EventEmitter } from 'events';
import * as fs from 'fs';
import type { DiscoveredSession } from '../src-shared/types';

const POLL_INTERVAL_MS = 500;
const MAX_CHUNK_SIZE = 64 * 1024; // 64KB per read

interface WatchedSession {
  sessionId: string;
  jsonlPath: string;
  fileOffset: number;
  lineBuffer: string;
  timer: ReturnType<typeof setInterval>;
  agentId: number;
}

// Generate a stable numeric ID from a session path so the same session
// always maps to the same agent ID (and thus the same character appearance).
function stableIdFromPath(sessionPath: string): number {
  let hash = 5381;
  for (let i = 0; i < sessionPath.length; i++) {
    hash = ((hash << 5) + hash + sessionPath.charCodeAt(i)) & 0x7fffffff;
  }
  // Ensure positive non-zero
  return (hash % 100000) + 1;
}

export class FileWatcherManager extends EventEmitter {
  private sessions = new Map<string, WatchedSession>();

  watchSession(session: DiscoveredSession): void {
    if (this.sessions.has(session.sessionId)) return;

    const agentId = stableIdFromPath(session.jsonlPath);

    // Notify renderer about new agent FIRST
    this.emit('agent-message', {
      channel: 'agent:added',
      data: { id: agentId, folderName: session.sessionId },
    });

    const watched: WatchedSession = {
      sessionId: session.sessionId,
      jsonlPath: session.jsonlPath,
      fileOffset: 0,
      lineBuffer: '',
      agentId,
      timer: setInterval(() => this.pollSession(watched), POLL_INTERVAL_MS),
    };

    // Start from END of file — only watch NEW activity, don't replay history
    try {
      const stat = fs.statSync(session.jsonlPath);
      watched.fileOffset = stat.size;
    } catch (e) {
      console.debug('[FileWatcherManager] stat initial file offset failed:', e);
    }

    this.sessions.set(session.sessionId, watched);
  }

  unwatchSession(sessionId: string): void {
    const watched = this.sessions.get(sessionId);
    if (!watched) return;

    clearInterval(watched.timer);
    this.sessions.delete(sessionId);

    this.emit('agent-message', {
      channel: 'agent:removed',
      data: { id: watched.agentId },
    });
  }

  unwatchAll(): void {
    for (const [sessionId] of this.sessions) {
      this.unwatchSession(sessionId);
    }
  }

  restartAll(): void {
    for (const watched of this.sessions.values()) {
      clearInterval(watched.timer);
      watched.timer = setInterval(() => this.pollSession(watched), POLL_INTERVAL_MS);
    }
  }

  private pollSession(watched: WatchedSession): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(watched.jsonlPath);
    } catch (e) {
      console.debug('[FileWatcherManager] poll stat failed:', e);
      this.unwatchSession(watched.sessionId);
      return;
    }

    if (stat.size <= watched.fileOffset) return;

    const readSize = Math.min(stat.size - watched.fileOffset, MAX_CHUNK_SIZE);

    try {
      const fd = fs.openSync(watched.jsonlPath, 'r');
      const buffer = Buffer.alloc(readSize);
      try {
        fs.readSync(fd, buffer, 0, readSize, watched.fileOffset);
      } finally {
        fs.closeSync(fd);
      }
      watched.fileOffset += readSize;

      const text = watched.lineBuffer + buffer.toString('utf-8');
      const lines = text.split('\n');
      watched.lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        this.processLine(watched, line.trim());
      }
    } catch (e) {
      console.debug('[FileWatcherManager] read chunk failed:', e);
    }
  }

  private processLine(watched: WatchedSession, line: string): void {
    try {
      const record = JSON.parse(line);
      this.processRecord(watched, record);
    } catch (e) {
      console.debug('[FileWatcherManager] JSON parse failed:', e);
    }
  }

  private processRecord(watched: WatchedSession, record: Record<string, unknown>): void {
    const agentId = watched.agentId;

    if (record.type === 'assistant' && record.message) {
      const msg = record.message as Record<string, unknown>;
      const content = msg.content;
      if (!Array.isArray(content)) return;

      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;

        if (b.type === 'tool_use') {
          const toolId = String(b.id ?? '');
          const toolName = String(b.name ?? '');
          const displayStatus = this.getToolDisplayStatus(toolName);
          this.emit('agent-message', {
            channel: 'agent:tool-start',
            data: { id: agentId, toolId, status: displayStatus },
          });
        }
      }
    }

    if (record.type === 'tool_result' || record.type === 'result') {
      const toolId = String((record as Record<string, unknown>).tool_use_id ?? '');
      if (toolId) {
        setTimeout(() => {
          this.emit('agent-message', {
            channel: 'agent:tool-end',
            data: { id: agentId, toolId },
          });
        }, 300);
      }
    }

    if (record.type === 'system') {
      const subtype = (record as Record<string, unknown>).subtype;
      if (subtype === 'turn_duration') {
        this.emit('agent-message', {
          channel: 'agent:status-changed',
          data: { id: agentId, status: 'idle' },
        });
      }
    }
  }

  private getToolDisplayStatus(toolName: string): string {
    switch (toolName) {
      case 'Read': return 'Reading file';
      case 'Glob': return 'Searching files';
      case 'Grep': return 'Searching code';
      case 'WebFetch': return 'Fetching web';
      case 'WebSearch': return 'Searching web';
      case 'Edit': return 'Editing code';
      case 'Write': return 'Writing file';
      case 'Bash': return 'Running command';
      case 'NotebookEdit': return 'Editing notebook';
      case 'Agent': return 'Subtask: Agent';
      case 'Task': return 'Subtask: Task';
      case 'AskUserQuestion': return 'Waiting for input';
      case 'TodoWrite': return 'Writing todos';
      default: return `Using ${toolName}`;
    }
  }
}
