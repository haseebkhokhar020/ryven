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

The smoke code calls the renderer's `window.ryven.recent()` preload bridge, which reads through the SQLite IPC path. It does not open a workspace, run terminal commands, exercise Monaco editing, test a Windows installer, or evaluate Windows code signing. The Windows smoke routine in `docs/workflow-templates/` will be able to provide that narrower evidence **only once the owner grants the required GitHub workflow permission and the workflow actually runs**.

Trusted publisher signing needs an appropriate code-signing certificate controlled by the project owner. No certificate has been supplied, and unsigned executables must remain labeled as such.
