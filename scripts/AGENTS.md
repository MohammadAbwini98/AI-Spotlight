# Local Agent Rules — scripts/

> Also read: `../AGENTS.md` before editing this folder.

---

## Scope

This folder contains **developer and build scripts**:

- Build automation scripts
- Packaging scripts
- Database/storage initialization scripts
- Developer utility scripts

---

## Required Reading

Before editing this folder:

- `../AGENTS.md`
- `../docs/ai/COMMANDS.md` — known commands and scripts

---

## Local Rules

1. **Scripts must be safe and repeatable.** Avoid side effects that cannot be undone without manual intervention.
2. **Destructive defaults are forbidden.** Any script that deletes data, resets state, or modifies production resources must require explicit confirmation (a `--force` flag or interactive prompt).
3. **No hardcoded secrets.** Scripts must read credentials and environment-specific values from environment variables, never hardcode them.
4. **Never print secrets.** Scripts must not log API keys, passwords, or tokens to the console.
5. **Document required environment variables.** Every script that requires env vars must document them at the top of the file or in a comment.
6. **Prefer dry-run mode.** For destructive or production-touching scripts, implement a `--dry-run` flag that previews actions without executing them.
7. **Cross-platform awareness.** If the app targets multiple OSes, scripts should use Node.js utilities instead of bash-only commands where possible.

---

## Testing / Verification

- Test scripts on a clean environment before relying on them in CI/CD
- Verify that scripts do not accidentally overwrite production data

---

## Do Not Break

- The `npm run build` pipeline if it relies on scripts in this folder
- Any packaging scripts required for distribution

---

## Update Requirements

After adding or changing scripts:

- `../docs/ai/COMMANDS.md` — document any new script invocations
- `../docs/ai/TASK_LOG.md` — always append a new entry
