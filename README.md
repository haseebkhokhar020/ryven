# RYVEN — The Development Engine

**CODE · TEST · BUILD · VERIFY**

RYVEN is a working Electron development-environment MVP, not a mock dashboard. It combines a local workspace, Monaco editor, interactive process-backed terminal, project tasks, project generation, local web preview, toolchain detection, Git status, permissioned AI questions, scoped security scanning, and evidence from real test/build runs. The browser preview shows the interface but deliberately cannot access native files or spawn processes.

## Run it

Requirements: Node.js 20+, npm, a desktop environment with Electron's platform libraries. On Linux, a working graphical session and Electron runtime libraries (including `libnss3`) are required.

```bash
cd ryven
npm install
npm run dev:desktop    # Electron + Vite development mode
```

For the interface-only browser preview, run `npm run dev` and open http://localhost:5173. Native operations are disabled there; this is **not** a substitute for the desktop app.

```bash
npm test               # 15 real automated tests
npm run build          # TypeScript checks + Electron main + renderer
npm run package        # OS-specific Electron package (requires packaging prerequisites)
```

`npm run package:win` produces NSIS and portable Windows `.exe` candidates. **Unsigned Windows x64 executables were cross-built on Linux using Wine**, identified as Windows PE/NSIS files, SHA-256 hashed, and inspected for packaged application assets. They have **not been launched or tested on a real Windows machine**; they are experimental release candidates, not production-certified. A packaged Linux Electron app was run under a virtual display and passed a smoke check: React mounted, the sandboxed preload loaded, and the SQLite IPC call returned successfully. This does **not** validate Windows behavior. Automated source/build tests passed here.

**GitHub status:** source is published at [haseebkhokhar020/ryven](https://github.com/haseebkhokhar020/ryven). [GitHub Actions workflows](https://github.com/haseebkhokhar020/ryven/actions) are configured for Linux and Windows verification, packaged-app smoke checks, and Windows build artifacts; consult each run for *actual* results, not assumptions. The [v0.1.0 experimental prerelease](https://github.com/haseebkhokhar020/ryven/releases/tag/v0.1.0) contains unsigned executables built before CI was enabled; check its notes and hashes. CI does not retroactively verify those exact binary files.

## Implemented in this MVP

| Area | What actually works |
| --- | --- |
| Workspace | Native folder picker, recent workspaces in SQLite, read-only restricted mode, explicit trust, file tree, create/read/write text files, save/dirty tabs. Symlinks escaping the workspace are rejected. |
| Editor | Locally packaged, offline Monaco. Highlighting for listed initial languages, Monaco's built-in TypeScript/JavaScript/JSON/HTML/CSS services, search, folding, multi-cursor, minimap, tabs. Other languages have tokenization, **not** LSP support yet. |
| Command Center | Ctrl+Shift+P for commands and loaded file names. Ctrl+S saves; Ctrl+` opens a terminal. |
| Projects | Generates real React + TypeScript, vanilla TypeScript, Node API, Python CLI, or blank projects. Optionally runs `git init`. Shows the list of written files. Never installs dependencies silently. |
| Runtime | Detects npm scripts and Python/Go/Rust manifests; starts real run/test/build processes with streamed output, exit codes, stop controls and multiple terminal tabs. Unix terminal uses `script` for a PTY; Windows uses PowerShell. |
| Preview | Recognizes loopback URLs from run output; sandboxed embedded iframe, reload, three widths, explicit external opening. Web server must be started by the user. |
| Tooling | Detects common installed tools without installing anything. Git status is read only and requires a trusted workspace. |
| Verification | Shows session-local evidence for source open, run, test and build; does not invent test results or call an unrun check verified. |
| AI Engineer | OpenAI-compatible and Anthropic-compatible endpoints, including local models. Exact file context preview and approval on each request, transient keys, no autonomous editing or command execution. |
| Node debugger | Real Node inspector launch for a JavaScript entrypoint, conditional breakpoints, gutter markers, pause/resume/step controls, call stack, local variables and watch evaluation. The inspector was exercised by an automated breakpoint-and-evaluation test. Other language debuggers are not implemented. |
| Extensions | Explicit review/install/uninstall of local JSON snippet packs. Only the `snippets` permission is accepted; no third-party extension JavaScript executes. Compatible snippets insert at the editor cursor, with installation/removal logged. |
| RYVEN Shield | On-demand local secret heuristics and actual `npm audit --omit=dev` when a lockfile exists. Reports incomplete scans; does not claim to detect every vulnerability. npm audit sends dependency metadata to your configured registry when you click Run. |
| Releases | Locally cross-built unsigned Windows NSIS and portable executables with SHA-256 checksums. GitHub Actions workflows are configured; their actual run results must be inspected before claiming Windows verification. Packaged Linux GUI smoke passed; real Windows smoke and trusted code signing remain pending. |

**Coming soon, not simulated:** AI project planner and patch review, language-server adapters, non-Node debuggers, test discovery/coverage, requirements traceability, broad application-security scanners, RYVEN Pulse profiling, failure repair, executable extension APIs/market, and full Git workflows. The relevant surfaces are clearly labeled. No cloud AI calls occur without per-request approval; there is no telemetry, autonomous editing or production deployment.

## Trust and execution model

- Renderer uses `contextIsolation`, `sandbox`, no Node integration, a limited preload API, validated IPC sender, blocked navigation/new windows and denied web permissions.
- File operations are confined to the selected workspace using real paths. Unknown workspaces open restricted: reading is allowed; writes, terminal, task execution and Git status require explicit trust.
- The project wizard requires a folder selected through the native picker and never overwrites an existing project. Dependencies are **not** installed during generation.
- Preview only opens explicit loopback HTTP URLs and is embedded without same-origin privileges.
- Terminal and task processes run as the current OS user once a workspace is trusted. **Workspace trust is not an OS sandbox.** Do not run untrusted project scripts, and do not assume the terminal cannot access files outside the workspace. A future release needs stronger process isolation and policy enforcement for autonomous agents.
- Monaco assets are shipped in `public/vendor/vs` so editing does not fetch a CDN. SQL.js provides an on-disk SQLite database in Electron's per-user data directory.
- AI API keys are held in panel memory, not persisted; provider calls occur from the Electron main process only after approval. AI text is suggestions, not verified changes.
- The on-demand source scanner reads local files. The optional npm dependency audit contacts your configured npm registry; a missing lockfile or scanner failure means an **incomplete** report.
- Extension manifests are validated and copied into app data only after a local-file preview and explicit approval. No extension process, imports, network permission or executable entrypoint is allowed.

## Structure

```text
electron/
  main.ts        Window + IPC boundary
  preload.ts     Narrow renderer bridge
  workspace.ts   Workspace filesystem containment
  processes.ts   Terminal, tasks, toolchain detection
  projects.ts    Real project templates
  store.ts       SQLite local data
  ai.ts          Approval-gated provider requests
  security.ts    Scoped local secret + npm audit scanners
  debug.ts       Node inspector session and step controls
  extensions.ts  Declarative extension validation and storage
shared/          Typed bridge contracts
src/
  components/    Editor shell, panels and overlays
  lib/           State, language mapping, local Monaco config
  styles/        UI design system
tests/           Boundary, generation, runtime, AI, debugger and extension tests
public/vendor/vs/ Offline Monaco runtime (packaged with the app)
```

## Known MVP limits

- Text editor limit is 2 MB per file. There is no binary editor, filesystem watcher, split editor or workspace restore of open tabs yet.
- The browser preview is interface-only. Full functionality requires Electron.
- The preview discovers local URLs from the run process output. It does not yet capture console/network errors or handle every server discovery pattern.
- Python, Rust and Go task adapters require their respective installed tools; if absent, the process reports a real spawn error.
- UI verification covers only observed process exit codes, not requirements, security, performance or regression safety. A successful command is not a claim of overall product correctness.
- The scoped security scan does not cover injection, auth, XSS, CSRF, cryptography, runtime or all secrets. AI assistance does not implement patch application or repair. Node debugging is limited to an existing JavaScript entrypoint and does not provide full DAP or other-language adapters. Extensions support declarative snippet packs only.
- Real-Windows installer smoke tests, installer signing, and final production acceptance still require explicit work; see [docs/RELEASING.md](docs/RELEASING.md).
- The integrated terminal requires `script` on macOS/Linux; process launch and packaging need validation on target operating systems.

RYVEN is designed for incremental expansion through the typed preload contract, dedicated services and renderer state, with later-phase work explicitly separated from the functioning MVP.
