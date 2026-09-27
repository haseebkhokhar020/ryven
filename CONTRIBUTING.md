# Contributing to RYVEN

RYVEN is an evolving desktop development platform; do not represent incomplete subsystems as verified. See the exact implemented-vs-planned matrix in [README.md](README.md).

## Local checks

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Tests must exercise actual behavior, not placeholder assertions. For Electron code, keep filesystem/process/AI/network access behind the typed `shared/contracts.ts` preload boundary, validate IPC inputs, and require workspace trust and user consent where relevant. Never add telemetry or automatic source upload. Avoid adding credentials to tests or repository history.

Submit small changes with a description of observed behavior, test evidence, privacy effects and any unfinished edge cases. Windows installer changes need a real Windows smoke test before a public release.
