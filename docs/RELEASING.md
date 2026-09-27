# RYVEN release procedure

RYVEN is **not production certified**. Release workflows generate **unsigned** Windows candidate builds. Do not publish the draft until manual installation, runtime, uninstall, trust-boundary and project workflow checks pass on a real Windows machine.

## Current publication status

The public source repository is [haseebkhokhar020/ryven](https://github.com/haseebkhokhar020/ryven). Unsigned Windows NSIS and portable executables were built locally using Wine, hashed and inspected as PE binaries, and attached to the [v0.1.0 experimental prerelease](https://github.com/haseebkhokhar020/ryven/releases/tag/v0.1.0). **They were not run on a real Windows computer** and must be treated as experimental candidates. A newly packaged Linux build passed a GUI/preload/SQLite smoke check under Xvfb; this is not evidence of Windows correctness.

The owner approved the GitHub CLI's `workflow` scope. The workflows are now installed in `.github/workflows/`, with reference copies in [`docs/workflow-templates/`](workflow-templates/). **Workflow configuration is not proof of success:** inspect the [Actions page](https://github.com/haseebkhokhar020/ryven/actions) and preserve run links for builds before declaring Windows checks passed. The already-published v0.1.0 executables predate CI and remain unverified on real Windows.

Never paste a personal access token, password or signing certificate into chat or source files.

## CI and release

- On push/PR to `main`, CI runs typecheck, 15 automated tests, npm production-dependency audit and renderer/Electron build on Ubuntu and Windows. A separate Windows job uploads unsigned NSIS and portable `.exe` files as a **workflow artifact**. No release tag needed for CI artifacts.
- Set `package.json` version to the intended release candidate, review changelog/tests, then push a matching tag (for example `v0.1.0`). `.github/workflows/release.yml` performs verification on Windows, builds both `.exe` formats, creates SHA-256 checksums and creates a **draft prerelease**. Review and test before publishing the draft.
- Optional Windows code signing requires an appropriate certificate and secure CI setup. No certificate is present. An unsigned installer can trigger Windows SmartScreen warnings; do not call it signed.
- Actions do **not** publish automatically from PRs. Release permissions are limited to the release workflow.

## Manual release gate (not automated)

- [ ] Windows clean-machine installation and uninstall; launch from installed and portable executables. Automated packaged Windows GUI smoke is now defined in the inactive workflow template, but has not run.
- [ ] Workspace select, restricted mode, trust transitions, symlink/path escapes, text write and save.
- [ ] PTY terminal input, process stop, npm run/test/build, actual test failure display.
- [ ] Web preview on localhost, sandbox behavior and external opening.
- [ ] Node inspector breakpoints/stepping and snippet extension import, insert and uninstall.
- [ ] Generated Node API endpoint test and generated React build after explicit `npm install`.
- [ ] AI context consent and endpoint permission checks (if included in this version).
- [ ] Security report identifies scanner failures rather than claiming no findings.
- [x] Record SHA-256 sums and inspect PE format/packaged assets.
- [ ] Run and test both executables on real Windows before any production declaration.

GitHub Actions results are evidence only for commands run by the workflow. They are not a substitute for packaging smoke tests, security review, code signing or full roadmap completion.
