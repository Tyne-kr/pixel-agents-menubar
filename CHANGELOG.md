# Changelog

## [1.0.0] - 2026-03-28

### Added
- macOS menubar tray app with pixel-art office visualization
- Real-time Claude Code agent detection via JSONL session monitoring
- Sub-agent visualization (characters spawn near parent agent)
- Mouse wheel zoom (0.1 step) and click-drag pan
- "Fit" button to auto-fit office to window
- "Full" button for native macOS fullscreen toggle
- ESC key to exit fullscreen (window-scoped, not global)
- Auto-fit on app start, fullscreen enter/exit
- Project selector dropdown for multi-project support
- Agent status display in bottom bar (idle/active/tool name)
- Active agent count badge in top bar

### Security
- Path traversal protection in custom protocol handler
- Window-scoped ESC handler (not global shortcut)
- File descriptor leak prevention with try/finally

### Performance
- Async file I/O for agent discovery (non-blocking main thread)
- Ref-based game loop (no unnecessary restarts on zoom/tick)
- Stale closure prevention in useExtensionMessages

### Based On
- [pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca
- Ported from VS Code extension to standalone Electron menubar app
