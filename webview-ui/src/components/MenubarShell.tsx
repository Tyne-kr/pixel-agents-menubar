import { useState, useEffect, useCallback } from 'react';

const SYSTEM_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif';
const BAR_FONT_SIZE = '20px';

interface AgentStatus {
  agentId: number;
  status: string;
  toolName?: string;
}

interface Project {
  hash: string;
  path: string;
  lastModified: number;
  sessions: Array<{ sessionId: string; isActive: boolean }>;
}

function getProjectDisplayName(hash: string): string {
  // Project hash looks like "-Users-jc-m5pro-ai-claude-pixel-Agents"
  // Extract last meaningful segment
  const parts = hash.replace(/^-/, '').split('-');
  // Take last 2-3 parts for a readable name
  return parts.slice(-2).join('-');
}

export function MenubarShell({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Map<number, AgentStatus>>(new Map());
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [windowMode, setWindowMode] = useState<'popover' | 'fullscreen'>('popover');

  const api = (window as Record<string, unknown>).pixelAgentsAPI as {
    toggleFullscreen: () => void;
    selectProject: (hash: string) => void;
  } | undefined;

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data;
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'agentCreated') {
        const id = msg.id as number;
        setAgents((prev) => {
          const next = new Map(prev);
          next.set(id, { agentId: id, status: 'idle' });
          return next;
        });
      } else if (msg.type === 'agentClosed') {
        const id = msg.id as number;
        setAgents((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      } else if (msg.type === 'agentToolStart') {
        const id = msg.id as number;
        const status = msg.status as string;
        setAgents((prev) => {
          const next = new Map(prev);
          next.set(id, { agentId: id, status, toolName: status });
          return next;
        });
      } else if (msg.type === 'agentToolDone') {
        const id = msg.id as number;
        setAgents((prev) => {
          const next = new Map(prev);
          const existing = next.get(id);
          if (existing) {
            next.set(id, { ...existing, status: 'idle', toolName: undefined });
          }
          return next;
        });
      } else if (msg.type === 'agentToolsClear' || msg.type === 'agentStatus') {
        const id = msg.id as number;
        const status = (msg.status as string) ?? 'idle';
        setAgents((prev) => {
          const next = new Map(prev);
          const existing = next.get(id);
          if (existing) {
            next.set(id, { ...existing, status, toolName: undefined });
          }
          return next;
        });
      } else if (msg.type === 'projectsUpdated') {
        const p = (Array.isArray(msg.projects) ? msg.projects : []) as Project[];
        setProjects(p);
        if (!selectedHash && p.length > 0) {
          setSelectedHash(p[0].hash);
        }
      } else if (msg.type === 'windowModeChanged') {
        setWindowMode(msg.mode as 'popover' | 'fullscreen');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [selectedHash]);

  const handleProjectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const hash = e.target.value;
    setSelectedHash(hash);
    api?.selectProject(hash);
  }, [api]);

  const handleToggleFullscreen = useCallback(() => {
    api?.toggleFullscreen();
  }, [api]);

  const agentArray = Array.from(agents.values());
  const agentCount = agentArray.length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--pixel-bg, #1e1e2e)',
      overflow: 'hidden',
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        height: '36px',
        WebkitAppRegion: 'drag' as unknown as string,
        background: 'var(--pixel-bg, #1e1e2e)',
        borderBottom: '1px solid var(--pixel-border, #4a4a6a)',
        flexShrink: 0,
        fontFamily: SYSTEM_FONT,
        fontSize: BAR_FONT_SIZE,
        color: 'var(--pixel-text, rgba(255,255,255,0.8))',
      }}>
        {/* Project selector dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' as unknown as string }}>
          {projects.length > 0 ? (
            <select
              value={selectedHash ?? ''}
              onChange={handleProjectChange}
              style={{
                fontSize: '13px',
                padding: '2px 6px',
                border: '1px solid var(--pixel-border, #4a4a6a)',
                borderRadius: '4px',
                background: 'var(--pixel-btn-bg, rgba(255,255,255,0.08))',
                color: 'var(--pixel-text, rgba(255,255,255,0.8))',
                maxWidth: '220px',
                cursor: 'pointer',
                fontFamily: SYSTEM_FONT,
              }}
            >
              {projects.map((p) => (
                <option key={p.hash} value={p.hash}>
                  {getProjectDisplayName(p.hash)}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ opacity: 0.4, fontSize: '13px' }}>No projects</span>
          )}
          {agentCount > 0 && (
            <span style={{
              fontSize: '18px',
              background: 'var(--pixel-green, #5ac88c)',
              color: '#000',
              padding: '1px 6px',
              borderRadius: '3px',
              fontWeight: 600,
            }}>
              {agentCount} active
            </span>
          )}
        </div>

        {/* Fullscreen: use macOS native green button, no custom button needed */}
      </div>

      {/* Canvas area – use absolute positioning for children so height:100%
          chains resolve reliably regardless of flex percentage resolution quirks */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          {children}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 12px',
        minHeight: '34px',
        background: 'var(--pixel-bg, #1e1e2e)',
        borderTop: '1px solid var(--pixel-border, #4a4a6a)',
        fontSize: BAR_FONT_SIZE,
        color: 'var(--pixel-text-dim, rgba(255,255,255,0.7))',
        flexShrink: 0,
        overflow: 'hidden',
        fontFamily: SYSTEM_FONT,
      }}>
        {/* Left: Agent status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {agentArray.length === 0 ? (
            <span style={{ opacity: 0.4 }}>No agents detected</span>
          ) : (
            agentArray.map((a) => (
              <span key={a.agentId} style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: a.status === 'idle' ? '#888' :
                    a.status.includes('Waiting') ? '#f59e0b' : '#22c55e',
                  flexShrink: 0,
                }} />
                {a.toolName ?? a.status}
              </span>
            ))
          )}
        </div>

        {/* Right: Fit + Full buttons */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          <button
            onClick={() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'fitToScreen' } }))}
            title="Fit office to screen"
            style={{
              background: 'var(--pixel-btn-bg, rgba(255,255,255,0.08))',
              border: '1px solid var(--pixel-border, #4a4a6a)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 8px',
              color: 'var(--pixel-text-dim)',
              fontFamily: SYSTEM_FONT,
              borderRadius: '3px',
            }}
          >
            ⊞ Fit
          </button>
          <button
            onClick={handleToggleFullscreen}
            title="Toggle fullscreen (ESC to exit)"
            style={{
              background: 'var(--pixel-btn-bg, rgba(255,255,255,0.08))',
              border: '1px solid var(--pixel-border, #4a4a6a)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 8px',
              color: 'var(--pixel-text-dim)',
              fontFamily: SYSTEM_FONT,
              borderRadius: '3px',
            }}
          >
            ⛶ Full
          </button>
        </div>
      </div>
    </div>
  );
}
