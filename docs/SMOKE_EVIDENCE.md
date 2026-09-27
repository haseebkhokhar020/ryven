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

The smoke code calls the renderer's `window.ryven.recent()` preload bridge, which reads through the SQLite IPC path. It does not open a workspace, run terminal commands, exercise Monaco editing, test a Windows installer, or evaluate Windows code signing. The Windows smoke routine is now configured under `.github/workflows/`. An [actual Windows GitHub Actions run](https://github.com/haseebkhokhar020/ryven/actions/runs/36317215158) passed the packaged `win-unpacked/RYVEN.exe` renderer/preload/SQLite smoke. It did not test the 0.1.0 public installer and portable wrapper. Later v0.1.1 CI and release runs below did test the portable and NSIS-installed files.

Trusted publisher signing needs an appropriate code-signing certificate controlled by the project owner. No certificate has been supplied, and unsigned executables must remain labeled as such.

## Windows packaged executable evidence — 2026-09-27

[GitHub Actions run 36317489660](https://github.com/haseebkhokhar020/ryven/actions/runs/36317489660) passed from commit `ab608c7` (RYVEN 0.1.1), including:

- `Verify windows-latest`: `npm ci`, typecheck, 15 automated tests, production dependency audit and renderer/Electron build.
- `Verify ubuntu-latest`: same checks, plus the Linux packaged GUI smoke job.
- `Windows packaged smoke and unsigned installers`: built NSIS and portable Windows x64 executables **on a Windows runner**. Executed unpacked `RYVEN.exe`, the portable `.exe`, and an installed `RYVEN.exe` following silent NSIS installation. Every launch returned `ok: true`, `platform: "win32"`, `mounted: true`, `preload: true` from a real renderer/preload/SQLite IPC call. Silent uninstall completed. The build artifact was uploaded.

This is **real Windows CI smoke evidence**, but a hosted runner is not an independent clean-machine manual QA pass. The smoke check does not cover opening a project, editing in Monaco, debugging, terminal input, network preview, AI provider calls, accessibility, performance, or security review. The binaries were **unsigned**; the electron-builder log explicitly reported no signing information.

## v0.1.1 release asset verification — 2026-09-27

[Release workflow run 36318077058](https://github.com/haseebkhokhar020/ryven/actions/runs/36318077058) passed on the tag source. Its Windows runner built the setup and portable `.exe` files, launched unpacked/portable/installed RYVEN with `platform: "win32"`, ran the renderer/preload/SQLite IPC smoke, and silently uninstalled. The uploaded release assets were downloaded and `sha256sum -c SHA256SUMS.txt` returned **OK for both binaries**.

This is stronger than an untested cross-build but remains a scoped automated smoke, not a comprehensive Windows security/accessibility/performance/manual acceptance program. Electron-builder reported **no signing info**; Authenticode signing is still absent.
