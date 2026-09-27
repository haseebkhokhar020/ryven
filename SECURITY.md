# Security policy

RYVEN is currently an **experimental release candidate**, not a security-certified IDE. Its terminal and user-run project scripts execute with the current user's OS privileges after workspace trust; trust is not a sandbox.

- Never commit API keys, certificates or private credentials. Workspace and AI permissions must remain explicit.
- To report a vulnerability privately once the GitHub repository exists, use GitHub's **Report a vulnerability** feature if the owner has enabled private vulnerability reporting. Do not publish exploitable details in a public issue.
- No security support SLA or end-of-support date is promised for this prerelease.
- Third-party extension execution is disabled; only user-approved, declarative snippet text is imported. Snippets may contain code that a user later chooses to save/run, so inspect source before use.
- The scoped RYVEN Shield is a heuristic secret scan plus npm audit. It is not a comprehensive security assessment; incomplete scans are marked incomplete.

Maintainers should verify reports, prepare fixes and test regressions before disclosing technical details or publishing installers.
