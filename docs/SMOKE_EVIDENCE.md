# Packaged application smoke evidence

Date: 2026-09-27. Platform: Linux x86-64 in the development sandbox, using Xvfb. This check **does not validate Windows executables**.

Commands executed on the same source state:

```sh
npm ci
npm run build
npx electron-builder --linux dir --x64 --publish never
RYVEN_SMOKE_TEST=1 RYVEN_SMOKE_REPORT=linux-smoke-report.json \
  timeout 80s xvfb-run -a release/linux-unpacked/ryven --no-sandbox
```

Observed process exit: **0**. Report written by the *packaged Electron main process* after loading its local renderer, not invented by CI:

```json
{
  "ok": true,
  "platform": "linux",
  "mounted": true,
  "preload": true,
  "recentCount": 0,
  "title": "RYVEN — The Development Engine"
}
```

The smoke code calls the renderer's `window.ryven.recent()` preload bridge, which reads through the SQLite IPC path. It does not open a workspace, run terminal commands, exercise Monaco editing, test a Windows installer, or evaluate Windows code signing. The Windows smoke routine is now configured under `.github/workflows/`. An [actual Windows GitHub Actions run](https://github.com/haseebkhokhar020/ryven/actions/runs/36317215158) passed the packaged `win-unpacked/RYVEN.exe` renderer/preload/SQLite smoke. It did not test the 0.1.0 public installer and portable wrapper. The next workflow adds those explicit checks; its results must be inspected before claiming installer/portable evidence.

Trusted publisher signing needs an appropriate code-signing certificate controlled by the project owner. No certificate has been supplied, and unsigned executables must remain labeled as such.
