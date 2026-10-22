---
name: review-diff
description: Review the current working-tree diff of the MuktoDwar gateway for correctness and security issues, then report findings ranked by severity.
metadata:
  version: "1.0.0"
  domains: "code review, security"
---

# Diff Review

Review the current working-tree diff for correctness and security.

## When to use

The user asks to review changes, review the diff, check a PR, or look over my
recent edits. Also use after making a substantial change yourself.

## Steps

1. Run `git diff` (or `git diff HEAD` if nothing is staged) to see what changed.
2. Read the changed files in full where the diff is not self-explanatory.
3. Check each change against the module's stated intent (the header comments
   are the contract) and the hard constraints of the relevant domain agent:
   - **Security** (`src/security/`): fail-closed, no plaintext fallback,
     constant-time compare, loopback-only, secret redaction.
   - **Routing** (`src/providers/`, `src/api/`): free-only, no paid fallback,
     streaming pass-through, OpenAI compatibility.
   - **Config** (`src/config/`, `scripts/`): one version of truth, ACL'd state
     dir, generated files reproducible.
   - **Installer** (`installer/`, `scripts/build-installers.ps1`): shortcut
     ownership, executable out of the harvest, GUI subsystem.
4. Rank findings P0 (security/correctness bug) → P2 (style/drift).

## Reporting rules

- Report findings with file, line, the concrete failure scenario, and a
  suggested fix. Be specific.
- If the tree is clean, say so plainly — do not invent findings.
- Do not modify code during review unless the user asked for that.