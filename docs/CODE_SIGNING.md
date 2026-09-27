# Windows code-signing gate

RYVEN 0.1.0 installers on GitHub are **unsigned**. A code-signing certificate trusted by Windows cannot responsibly be created by generating a key in this repository: a self-signed certificate would still be untrusted and would not establish publisher identity.

To sign future Windows releases, the project owner must obtain a valid code-signing certificate from a trusted provider, complete any identity verification, and choose a secure key-management process. The draft release workflow template accepts **optional** GitHub Actions secrets `RYVEN_WINDOWS_CSC_LINK` and `RYVEN_WINDOWS_CSC_KEY_PASSWORD` for electron-builder's `CSC_LINK`/`CSC_KEY_PASSWORD` integration. Keep certificate material out of git, chat and issue comments. Protect releases with reviews and tag restrictions; verify the certificate and SHA-256 hashes on the actual Windows artifacts.

Even a signed executable is **not** production-certified. Windows package install/uninstall, workspace trust, editor, terminal, preview, AI privacy and scanner error behavior still need test evidence and a security review. Do not publish a draft as stable solely because signing succeeded.
