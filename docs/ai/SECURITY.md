# SECURITY.md — Security Rules and Guidelines

> These rules apply to all contributors and AI agents.

---

## Secret Handling Rules

1. **Never hardcode secrets** in source code, configuration files, or documentation.
2. All secrets must live in `.env` files that are listed in `.gitignore`.
3. Provide a `.env.example` file with placeholder values (not real values) to document required environment variables.
4. Never copy real secrets into documentation files (including `docs/ai/`).

---

## Environment Variable Rules

- All environment-specific configuration must use environment variables.
- Variable names should be `UPPER_SNAKE_CASE` and prefixed with the app domain (e.g., `SPOTLIGHT_TODO_`).
- If a variable is required for the app to start, document it in `.env.example` and `docs/ai/COMMANDS.md`.

> ❓ Verify required environment variables once application code exists.

---

## API Key / Token Rules

- API keys and tokens must never appear in:
  - Source code
  - Git commits
  - Log output
  - Documentation files
  - IPC messages (if avoidable)
- If the app needs external API access in the future, use a secure credential store or system keychain (not plain `.env` for production distribution).

---

## Logging Restrictions

- Never log sensitive user data (e.g., task content that may be private or confidential).
- Never log authentication tokens, API keys, or session identifiers.
- Log error context (function name, error code) but not the full payload.

---

## Safe Handling of User Data

- Task data is local to the user's machine — never transmit it to external servers without explicit user consent.
- Do not collect analytics or telemetry without clear disclosure.
- If a data export feature is added, ensure the user controls what is exported.

---

## Dependency / Security Notes

- Run `npm audit` periodically to identify vulnerable dependencies.
- Do not add packages with known critical vulnerabilities without a documented justification.
- Prefer well-maintained packages with active security patches.

---

## Files That Should Never Contain Secrets

```
AGENTS.md
CLAUDE.md
GEMINI.md
docs/**
*.md
*.json (except package.json scripts — never embed secrets there either)
*.ts
*.js
*.html
```

---

## Electron-Specific Security Rules

> 🔵 Inferred from Electron best practices:

- Enable `contextIsolation: true` in `BrowserWindow` options
- Enable `nodeIntegration: false` in renderer
- Use `contextBridge` to expose a minimal, safe API from preload to renderer
- Validate all IPC inputs in the main process before acting on them
- Do not use `shell.openExternal()` with user-provided URLs without sanitization

### Implemented controls

- Chromium sandbox, context isolation, disabled Node integration, restrictive CSP, and disabled insecure content.
- Production React/CSS assets use the privileged same-origin `spotlight://renderer` scheme; requests are confined to the packaged renderer root and traversal or other hosts/schemes are rejected while `webSecurity` remains enabled.
- Denied renderer navigation, new windows, webviews, downloads, permission requests, and permission checks.
- Privileged IPC accepts only the active application WebContents, its top frame, and the exact trusted `spotlight://renderer` origin (or explicit development origin), then applies channel-specific runtime validation and bounds.
- Renderer-writable settings are whitelisted; scan roots cannot be changed through the generic setter.
- Relative, UNC/device, whole-drive, system, profile-root, AppData, `.ssh`, and `.gnupg` scan roots are rejected.
- Active executable/script/installer/shortcut/registry/URL file types cannot be launched through `shell.openPath`.
- Release builds require Authenticode signing and hardened Electron fuses; unsigned output is a build failure.
- Private-use releases keep their non-exportable self-signed key in the build account's Current User certificate store and export only the public certificate. That public certificate must be explicitly trusted on each personally controlled account and is not suitable for public distribution.
- Full npm audit currently reports zero known vulnerabilities.

### Remaining data-protection requirement

The standard SQLite database is plaintext. `%LOCALAPPDATA%` placement and inherited per-user ACLs reduce accidental exposure but do not replace encryption. Full at-rest encryption requires an encrypted SQLite implementation plus protected-key generation, backup, recovery, and migration design; do not represent the database as encrypted until that work is completed.

---

## Secret Scan Checklist (Before Commit)

- [ ] No API keys in any file
- [ ] No passwords or tokens in any file
- [ ] `.env` is in `.gitignore`
- [ ] `.env.example` has only placeholder values
- [ ] `docs/ai/` files contain no secrets

> ❓ Verify `.gitignore` includes `.env` once repository code is present.
