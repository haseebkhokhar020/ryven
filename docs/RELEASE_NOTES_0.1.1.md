# RYVEN 0.1.1 — Windows CI-verified experimental prerelease

**Unsigned prerelease. Not production-certified.** Windows may warn about an unrecognized publisher. Do not disable system protections merely to run software you do not trust.

## Windows x64 downloads

- `RYVEN-0.1.1-x64-Setup.exe` — assisted NSIS installer.
- `RYVEN-0.1.1-x64-Portable.exe` — self-extracting portable executable.
- `SHA256SUMS.txt` — compare each downloaded file with `certutil -hashfile <filename> SHA256`.

## What was actually verified

[Windows and Linux GitHub Actions run 36317489660](https://github.com/haseebkhokhar020/ryven/actions/runs/36317489660) passed on source commit `ab608c7`: TypeScript/build, 15 automated tests, npm production-dependency audit, and a packaged Linux renderer/preload/SQLite IPC smoke. On a **Windows GitHub-hosted runner**, CI built NSIS and portable executables, then launched the unpacked app, launched the portable `.exe`, silently installed and launched the installer build, and silently uninstalled it. All three launches passed the packaged renderer/preload/SQLite IPC smoke.

[The release-specific Windows workflow run 36318077058](https://github.com/haseebkhokhar020/ryven/actions/runs/36318077058) also **passed** on tag `v0.1.1`. It rebuilt the exact tagged source, reran typecheck, all 15 tests, the production-dependency audit, and unpacked, portable and installed Windows GUI/preload/SQLite smoke checks; silent uninstall completed. The installer and portable assets uploaded by that workflow were downloaded again and **both matched the published SHA-256 sums**.

## Remaining gates

No publisher certificate or signing key was supplied; these executables remain **unsigned**. Hosted-runner smoke is narrower than manual clean-machine testing. Monaco editing, terminal, Git, Node debugging, security findings, AI privacy, performance and accessibility require dedicated Windows QA; a green smoke result is **not** proof that every original RYVEN requirement is complete. See [scope and limits](../README.md), [smoke evidence](SMOKE_EVIDENCE.md) and [code-signing requirements](CODE_SIGNING.md).
