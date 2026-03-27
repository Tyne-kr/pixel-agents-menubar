import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { DiscoveredProject, DiscoveredSession } from '../src-shared/types';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 10_000;
const ACTIVE_THRESHOLD_MS = 60_000; // Session active if modified within 60s

export class AgentDiscovery extends EventEmitter {
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private knownSessions = new Map<string, DiscoveredSession>();
  private selectedProjectHash: string | null = null;
  private customProjectsDir: string | null = null;

  get projectsDir(): string {
    return this.customProjectsDir ?? CLAUDE_PROJECTS_DIR;
  }

  setProjectsDir(dir: string): void {
    this.customProjectsDir = dir;
    this.rescan();
  }

  selectProject(hash: string): void {
    this.selectedProjectHash = hash;
    this.rescan();
  }

  startScanning(): void {
    this.rescan();
    this.scanTimer = setInterval(() => this.rescan(), SCAN_INTERVAL_MS);
  }

  stopScanning(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  rescan(): void {
    const projects = this.discoverProjects();
    this.emit('projects-updated', projects);

    // If a project is selected, discover its sessions
    const targetHash = this.selectedProjectHash ?? this.getMostRecentProjectHash(projects);
    if (!targetHash) return;

    const targetProject = projects.find((p) => p.hash === targetHash);
    if (!targetProject) return;

    const currentSessionIds = new Set(targetProject.sessions.map((s) => s.sessionId));
    const previousSessionIds = new Set(this.knownSessions.keys());

    // New sessions
    for (const session of targetProject.sessions) {
      if (!previousSessionIds.has(session.sessionId) && session.isActive) {
        console.log(`[discovery] New active session: ${session.sessionId} at ${session.jsonlPath}`);
        this.knownSessions.set(session.sessionId, session);
        this.emit('session-found', session);
      }
    }

    // Ended sessions
    for (const sessionId of previousSessionIds) {
      if (!currentSessionIds.has(sessionId)) {
        this.knownSessions.delete(sessionId);
        this.emit('session-ended', sessionId);
      }
    }

    // Update existing sessions
    for (const session of targetProject.sessions) {
      if (previousSessionIds.has(session.sessionId)) {
        const prev = this.knownSessions.get(session.sessionId);
        if (prev && !session.isActive && prev.isActive) {
          // Session became inactive
          this.knownSessions.delete(session.sessionId);
          this.emit('session-ended', session.sessionId);
        } else {
          this.knownSessions.set(session.sessionId, session);
        }
      }
    }
  }

  discoverProjects(): DiscoveredProject[] {
    const dir = this.projectsDir;
    if (!fs.existsSync(dir)) return [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const projects: DiscoveredProject[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectPath = path.join(dir, entry.name);
        const sessions = this.discoverSessions(projectPath);
        if (sessions.length === 0) continue;

        const lastModified = Math.max(...sessions.map((s) => s.lastModified));
        projects.push({
          hash: entry.name,
          path: projectPath,
          lastModified,
          sessions,
        });
      }

      return projects.sort((a, b) => b.lastModified - a.lastModified);
    } catch {
      return [];
    }
  }

  private discoverSessions(projectDir: string): DiscoveredSession[] {
    try {
      const entries = fs.readdirSync(projectDir, { withFileTypes: true });
      const sessions: DiscoveredSession[] = [];
      const now = Date.now();

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
        const jsonlPath = path.join(projectDir, entry.name);
        try {
          const stat = fs.statSync(jsonlPath);
          const lastModified = stat.mtimeMs;
          const isActive = now - lastModified < ACTIVE_THRESHOLD_MS;
          const sessionId = path.basename(entry.name, '.jsonl');

          sessions.push({ sessionId, jsonlPath, lastModified, isActive });
        } catch {
          continue;
        }
      }

      return sessions.sort((a, b) => b.lastModified - a.lastModified);
    } catch {
      return [];
    }
  }

  private getMostRecentProjectHash(projects: DiscoveredProject[]): string | null {
    if (projects.length === 0) return null;
    return projects[0].hash;
  }
}
