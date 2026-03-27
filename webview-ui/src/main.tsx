import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { MenubarShell } from './components/MenubarShell.tsx';
import { isBrowserRuntime } from './runtime';

async function main() {
  if (isBrowserRuntime) {
    const { initBrowserMock } = await import('./browserMock.js');
    await initBrowserMock();
  }

  // Detect if running in Electron (pixelAgentsAPI available via preload)
  const isElectron = typeof window !== 'undefined' && 'pixelAgentsAPI' in window;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {isElectron ? (
        <MenubarShell>
          <App />
        </MenubarShell>
      ) : (
        <App />
      )}
    </StrictMode>,
  );

  // Bridge: Electron IPC messages → window 'message' events
  // MUST register AFTER React renders so useExtensionMessages handler exists
  if (isElectron) {
    setTimeout(() => {
      const api = (window as Record<string, unknown>).pixelAgentsAPI as {
        onMessage: (cb: (msg: Record<string, unknown>) => void) => void;
      };
      api.onMessage((msg) => {
        window.dispatchEvent(new MessageEvent('message', { data: msg }));
      });
    }, 1000); // Wait for React mount + useExtensionMessages hook registration
  }
}

main().catch(console.error);
