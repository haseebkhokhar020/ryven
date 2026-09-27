# RYVEN 0.1.1 — Windows CI-verified experimental prerelease

**Unsigned prerelease. Not production-certified.** Windows may warn about an unrecognized publisher. Do not disable system protections merely to run software you do not trust.

## Windows x64 downloads

- `RYVEN-0.1.1-x64-Setup.exe` — assisted NSIS installer.
- `RYVEN-0.1.1-x64-Portable.exe` — self-extracting portable executable.
- `SHA256SUMS.txt` — compare each downloaded file with `certutil -hashfile <filename> SHA256`.

## What was actually verified

[Windows and Linux GitHub Actions run 36317489660](https://github.com/haseebkhokhar020/ryven/actions/runs/36317489660) passed on source commit `ab608c7`: TypeScript/build, 15 automated tests, npm production-dependency audit, and a packaged Linux renderer/preload/SQLite IPC smoke. On a **Windows GitHub-hosted runner**, CI built NSIS and portable executables, then launched the unpacked app, launched the portable `.exe`, silently installed and launched the installer build, and silently uninstalled it. All three launches passed the packaged renderer/preload/SQLite IPC smoke.

The release workflow rebuilds the **same versioned source** on Windows, reruns tests and package smoke, and publishes SHA-256 hashes. Inspect that workflow's specific run for the release binaries; a prior CI run alone cannot prove a separately built asset's result.

## Remaining gates

No publisher certificate or signing key was supplied; these executables remain **unsigned**. Hosted-runner smoke is narrower than manual clean-machine testing. Monaco editing, terminal, Git, Node debugging, security findings, AI privacy, performance and accessibility require dedicated Windows QA; a green smoke result is **not** proof that every original RYVEN requirement is complete. See [scope and limits](../README.md), [smoke evidence](SMOKE_EVIDENCE.md) and [code-signing requirements](CODE_SIGNING.md).
