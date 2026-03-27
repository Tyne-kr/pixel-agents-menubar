# Pixel Agents Menubar

A standalone macOS menubar app that visualizes your Claude Code agent activity as pixel-art characters working in a virtual office.

![Screenshot](screenshot.png)

## What is this?

This app is built for **Claude Desktop App** users who want to see their Claude Code agents visualized as animated pixel-art characters. When you run Claude Code through the Claude Desktop App, each agent appears as a character sitting at a desk, typing, reading, or wandering around a pixel-art office.

Sub-agents spawned during tasks also appear as separate characters with distinct appearances, sitting at available workstations.

## Features

- **macOS Menubar Tray App** -- Lives in your menubar, click to see the pixel office
- **Real-time Agent Detection** -- Automatically discovers active Claude Code sessions
- **Animated Characters** -- Agents type, read, walk, and idle with pixel-art animations
- **Sub-agent Visualization** -- Sub-agents appear as distinct characters at PC desks
- **Pin Window** -- Keep the office visible while working in other apps
- **Fit / Full Screen** -- Auto-fit office to window, native macOS fullscreen support
- **Project Selector** -- Switch between multiple Claude Code projects
- **Mouse Controls** -- Scroll to zoom, drag to pan
- **Diverse Characters** -- Each agent gets a unique appearance (6 palettes + hue shift)
- **Stable Appearance** -- Same agent keeps the same look across project switches

## Installation

### From Source

```bash
git clone https://github.com/YOUR_USERNAME/pixel-agents-menubar.git
cd pixel-agents-menubar
npm install
npm run build
npm start
```

### As Built App

Download `Pixel Agents.app` from the [Releases](../../releases) page and drag it to your Applications folder.

> **Important:** This app is not signed with an Apple Developer certificate. On first launch, macOS will show a warning saying the app is from an "unidentified developer." To open it:
> 1. Right-click (or Ctrl+click) the app
> 2. Select "Open" from the context menu
> 3. Click "Open" in the dialog
>
> Alternatively, go to System Settings > Privacy & Security > scroll down and click "Open Anyway."
>
> We plan to register as an Apple Developer in the future to eliminate this warning.

## How It Works

The app monitors `~/.claude/projects/` for JSONL session files created by Claude Code. It reads only tool names and IDs from these files (never your actual code or conversations) and translates agent activity into character animations:

| Agent Activity | Character Animation |
|---------------|-------------------|
| Using Read, Grep, Glob, WebSearch, WebFetch | Reading (looking at book) |
| Using Edit, Write, Bash, Agent | Typing (at keyboard) |
| Idle (between turns) | Walking around the office |
| Sub-agent spawned | New character appears at a desk |
| Sub-agent completed | Character despawns (matrix effect) |

## Requirements

- macOS 11.0 (Big Sur) or later
- Claude Code running via Claude Desktop App
- Currently built for Apple Silicon (arm64). Intel Mac users can build from source.

## Privacy

This app is completely offline and privacy-respecting:
- **No network calls** -- zero outbound connections
- **No telemetry** -- no analytics or tracking
- **No code reading** -- only reads tool names/IDs from JSONL, never your code
- **No data storage** -- only saves character palette preferences in localStorage
- **Read-only** -- never writes to any file outside its own directory

## Known Limitations

- Sub-agent characters stay visible for a minimum of 15 seconds for visual enjoyment, even if the sub-agent completes faster
- The app currently only builds for Apple Silicon (arm64). Intel Mac support can be added by modifying the build config
- Without Apple Developer signing, macOS shows a security warning on first launch

## Future Plans

- Bug fixes as they are discovered -- we will make our best effort to address reported issues
- Potential Apple Developer signing for seamless installation
- Intel Mac (x64) / Universal binary support
- Possible UX enhancements (character social interactions, conversation bubbles)

---

## Development History

This project was developed in a single intensive session, porting the original VS Code extension to a standalone Electron menubar app. Below is a detailed account of every bug encountered and how it was resolved.

### Bug Fix History

#### 1. Assets Not Loading -- "Loading..." Screen
**Problem:** The pixel office showed "Loading..." indefinitely.
**Root Cause:** The preload script injected `acquireVsCodeApi`, causing the renderer to wait for VS Code extension messages that never came.
**Fix:** Removed VS Code API injection; used browser mock mode for asset loading via `file://` protocol.

#### 2. Agent Characters Not Appearing
**Problem:** Office rendered with furniture but no agent characters.
**Root Cause:** `agentCreated` IPC message was sent before React mounted, so the message was lost.
**Fix:** Added message buffering in preload.ts -- messages are queued until `onMessage` callback is registered, then replayed.

#### 3. Mouse Drag Not Releasing
**Problem:** Click-drag to pan worked, but releasing the mouse button didn't stop dragging.
**Fix:** Added `window.addEventListener('mouseup')` global handler to catch mouse releases outside the canvas.

#### 4. Canvas Zoom Too Aggressive
**Problem:** Mouse wheel zoom steps were too large, making fine control impossible.
**Fix:** Reduced zoom step to 0.1 per wheel tick.

#### 5. Font Size Inconsistency
**Problem:** UI elements had mixed font sizes (13px to 20px), making some text barely readable.
**Fix:** Standardized all UI text to 16-20px range.

#### 6. Window Appearing at (0,0) on First Launch
**Problem:** App window appeared at the bottom-left corner of the screen on first launch.
**Root Cause:** `ready-to-show` event fired before tray icon was created, so `getPopoverPosition()` returned `{x: 0, y: 0}`.
**Fix:** Removed auto-show on `ready-to-show`; window only appears when tray icon is clicked. Added fallback position (center of primary display) if tray is unavailable.

#### 7. Global ESC Key Capture
**Problem:** `globalShortcut.register('Escape')` captured the Escape key system-wide, breaking it in all other apps.
**Fix:** Replaced with `webContents.on('before-input-event')` -- window-scoped, only active during fullscreen.

#### 8. File Descriptor Leak
**Problem:** If `fs.readSync` threw an error in the file watcher, the file descriptor was never closed.
**Fix:** Wrapped in `try/finally` to guarantee `fs.closeSync(fd)`.

#### 9. Path Traversal in Protocol Handler
**Problem:** The custom `pixel-agents://` protocol handler didn't validate file paths, allowing potential directory traversal attacks.
**Fix:** Added `path.resolve()` + `startsWith(webviewDir)` guard, returning 403 Forbidden for out-of-bounds requests.

#### 10. Agent Appearance Changing on Project Switch
**Problem:** Switching projects in the dropdown and switching back gave agents different character appearances.
**Root Cause:** Agent IDs were generated by an incrementing counter, so re-discovered sessions got new IDs and different palette assignments.
**Fix:** Implemented `stableIdFromPath()` using djb2 hash of session file path for deterministic IDs. Added localStorage persistence for palette/seat assignments.

#### 11. Sub-agents Clustering in Lounge Area
**Problem:** Sub-agent characters sat on sofas and lounge chairs instead of at PC desks.
**Root Cause:** Multiple failed attempts at custom seat-finding logic. `COFFEE_TABLE` and `SMALL_TABLE` had `isDesk: true`, causing lounge seats to be treated as work seats.
**Fix:** Used the existing `findFreeSeat()` method (which already prioritizes PC-facing seats via ray-casting for electronics) instead of writing custom logic. This was the key lesson of the project -- reuse proven existing functions before writing new ones.

#### 12. Sub-agents Never Disappearing
**Problem:** Sub-agent characters stayed in the office indefinitely after their tasks completed.
**Root Cause:** `tool_result` records in JSONL are nested inside `"type": "user"` messages as `message.content[].type === "tool_result"`. The parser was checking `record.type === 'tool_result'` at the top level, which never matched.
**Fix:** Parse `tool_result` from within `user` message `content[]` arrays, mirroring how `tool_use` is parsed from `assistant` message `content[]`.

#### 13. Agents Never Going Idle
**Problem:** Agents never transitioned to idle status when a turn completed.
**Root Cause:** The code checked for `subtype === 'turn_duration'` which doesn't exist in the JSONL. The actual turn-completion record uses `subtype === 'stop_hook_summary'`.
**Fix:** Changed the subtype check to match the real JSONL format.

#### 14. Sub-agents Disappearing Too Quickly
**Problem:** Fast-completing sub-agents appeared and vanished within the same polling cycle (< 1 second), creating a jarring flash.
**Fix:** Added a 15-second minimum display time. Sub-agent characters are tracked with a `createdAt` timestamp, and removal is delayed until at least 15 seconds have elapsed.

#### 15. App Icon Not Showing
**Problem:** The built `.app` showed a generic Electron icon instead of the custom pixel art icon.
**Root Cause:** The `.icns` file was missing the `512x512@2x` (1024x1024) variant required by macOS.
**Fix:** Regenerated the icon with all 10 required sizes. Cleared macOS icon cache.

### Architecture

```
Electron Main Process
  ├── Tray Icon (menubar)
  ├── AgentDiscovery (scans ~/.claude/projects/ every 10s)
  ├── FileWatcherManager (polls JSONL files every 500ms)
  └── IpcBridge (routes messages)
         │
    IPC / Preload Bridge
         │
React Renderer (Canvas)
  ├── MenubarShell (top bar + status bar + pin/fit/full)
  ├── OfficeCanvas (game loop + mouse/keyboard)
  ├── OfficeState (characters, furniture, seats)
  ├── Renderer (z-sorted canvas drawing)
  └── Characters FSM (type/idle/walk states)
```

### Data Flow

```
JSONL file → FileWatcherManager (poll) → IPC → Preload Bridge
→ window MessageEvent → useExtensionMessages → OfficeState
→ Game Loop → Canvas Renderer → Pixel Art Office
```

---

## Credits & Acknowledgments

This project is a standalone Electron port of the wonderful [**Pixel Agents**](https://github.com/pablodelucca/pixel-agents) VS Code extension.

**Huge thanks to [@pablodelucca](https://github.com/pablodelucca)** for creating the original Pixel Agents extension and open-sourcing it. The pixel art assets, character animations, office layout, rendering engine, and game loop are entirely his work. This project would not exist without his creative vision and generous open-source contribution.

The original extension brings joy to developers by turning the invisible work of AI coding agents into something you can actually watch and enjoy. We simply wanted to bring that same experience to Claude Desktop App users who don't use VS Code.

### What we kept from the original
- All pixel art assets (characters, furniture, floors, walls)
- Character FSM (type/idle/walk state machine)
- Canvas renderer (z-sorted scene drawing)
- Office layout system (seats, furniture placement, tile map)
- Game loop architecture

### What we added for the Electron port
- macOS menubar tray app with popover window
- Agent discovery via `~/.claude/projects/` JSONL monitoring
- JSONL file watcher with tool_use/tool_result parsing
- IPC bridge between Electron main process and React renderer
- Pin window feature (keep visible while using other apps)
- Fit-to-screen and native fullscreen support
- Stable agent IDs (hash-based) and appearance persistence
- Sub-agent desk assignment via `findFreeSeat()`
- Diverse sub-agent palettes (improvement over original's same-as-parent approach)
- 15-second minimum display time for sub-agents

### Special Thanks to gstack

A heartfelt thank you to **[@garrytan](https://github.com/garrytan)** and the [**gstack**](https://github.com/garrytan/gstack) project. As a complete beginner in app development, gstack made it possible for me to take this project from planning to QA through vibe coding with remarkable ease and confidence. The structured workflow -- from `/office-hours` for brainstorming, through `/review` for code review, to `/qa` for quality assurance -- guided the entire development process step by step. Without gstack, a novice like me could never have built, tested, and shipped a full Electron app in a single session. Thank you for making software development accessible to everyone.

---

## License

This project follows the same license as the original [pixel-agents](https://github.com/pablodelucca/pixel-agents) repository.

Built with Claude Code (Opus 4.6) via Claude Desktop App, powered by [gstack](https://github.com/garrytan/gstack).
