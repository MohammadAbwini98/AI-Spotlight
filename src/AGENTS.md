# Local Agent Rules — src/ (Shared Logic)

> Also read: `../AGENTS.md` and `../docs/ai/ARCHITECTURE.md` before editing this folder.

---

## Scope

This folder contains the **shared business logic** used by both the main and renderer processes:

- Task data models and types
- Storage read/write utilities (JSON file, SQLite, or other)
- Data validation
- Utility functions
- Shared constants

---

## Required Reading

Before editing this folder:

- `../AGENTS.md`
- `../docs/ai/ARCHITECTURE.md` — data flow and module ownership
- `../docs/ai/RULES.md` — storage and coding rules
- `../docs/ai/KNOWN_ISSUES.md` — storage fragile areas

---

## Local Rules

1. **Source of truth.** `src/` is the single source of truth for all data models and storage operations. Main process and renderer must not implement their own storage logic.
2. **Atomic writes.** Storage write operations must be atomic where possible — avoid partial writes that can corrupt data.
3. **Validate inputs.** All functions that accept task data must validate inputs before processing.
4. **TypeScript types.** All data models must be typed. No `any` types in new code.
5. **Pure functions preferred.** Business logic functions should be pure (same input → same output) and side-effect free where possible.
6. **No Electron imports.** `src/` must not import from `electron`. It is shared logic that must work independently of the Electron runtime.
7. **Export clean APIs.** Functions exported from `src/` are the contract. Do not change signatures without updating all callers.

---

## Testing / Verification

- Unit tests for all exported functions in `../tests/`
- Run tests after any storage or model changes:
  ```bash
  npm test
  ```
- Verify that task data persists correctly across app restarts

---

## Do Not Break

- Task data model schema (changing field names or types is a breaking change)
- Storage read/write functions relied on by the main process
- Data validation logic that protects storage integrity

---

## Update Requirements

After changes to this folder, update:

- `../docs/ai/ARCHITECTURE.md` if the data model or storage layer changed
- `../docs/ai/KNOWN_ISSUES.md` if a new fragile area or edge case is found
- `../docs/ai/TASK_LOG.md` always
