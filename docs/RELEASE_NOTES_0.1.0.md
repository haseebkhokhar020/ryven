# RYVEN 0.1.0 — experimental Windows prerelease

**This is an unsigned development release candidate, NOT a production-certified or code-signed IDE.**

## Downloads

- `RYVEN-0.1.0-x64-Setup.exe` — Windows x64 assisted NSIS installer.
- `RYVEN-0.1.0-x64-Portable.exe` — Windows x64 self-extracting portable app.
- `SHA256SUMS.txt` — SHA-256 checksums for both executable files. After downloading all three files to one folder, run `certutil -hashfile <filename> SHA256` in Windows and compare the listed hash.

**Build evidence:** Both files were cross-built with electron-builder and Wine from the RYVEN source in this repository. The resulting files were identified as PE/NSIS executables; the unpacked x64 executable is PE32+. The app archive was inspected for the Electron main process, React renderer, locally packaged Monaco, SQLite, and WebSocket client. The source passed TypeScript/renderer builds, 15 automated tests on Linux, and an npm production-dependency audit that reported zero vulnerabilities at build time.

**Not verified:** The installer and portable executable were **not launched, installed, uninstalled, or security-reviewed on an actual Windows machine**. No Windows CI run has passed. The executables are **unsigned** and may trigger Windows SmartScreen; never turn off system security protections just to run software you do not trust. Test on an isolated Windows machine before broader distribution.

## Included capabilities

Local workspaces and trust gating, Monaco editor, terminal and process-backed run/test/build, project generator, loopback web preview, Node inspector debugging, opt-in local/cloud AI questions, scoped security scans, and declarative snippet extensions. See the [README](../README.md) for implementation scope and honest limits.

## Workflow permission gate

GitHub rejected pushes to `.github/workflows/` because the authorized GitHub CLI token does not have the `workflow` OAuth scope. Workflow templates are in `docs/workflow-templates/` but **are not active** on this repository. Release binaries were built locally, not by GitHub Actions. The owner must explicitly grant the appropriate permission before activating CI.

No auto-update, telemetry, autonomous changes, or production deployment is configured.
