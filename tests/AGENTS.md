# Local Agent Rules — tests/

> Also read: `../AGENTS.md` and `../docs/ai/TESTING.md` before editing this folder.

---

## Scope

This folder contains the **test suite** for the application:

- Unit tests for `src/` business logic
- Integration tests for IPC handlers
- Possibly end-to-end tests for Electron behavior

---

## Required Reading

Before editing this folder:

- `../AGENTS.md`
- `../docs/ai/TESTING.md` — test framework, commands, and coverage gaps
- `../docs/ai/RULES.md` — testing rules

---

## Local Rules

1. **Follow existing conventions.** Use the same test framework, naming pattern (`.spec.ts`), and folder structure already present.
2. **Tests must be deterministic.** No randomness, no reliance on external services, no time-sensitive assertions.
3. **Test isolation.** Each test must set up and tear down its own state. Tests must not depend on execution order.
4. **Regression tests for bugs.** Every bug fix must include a new test that would have caught the bug.
5. **Do not test implementation details.** Test behavior and outputs, not internal implementation.
6. **Document tests that cannot run locally.** If a test requires a specific OS, hardware, or network, document it clearly.
7. **Do not commit failing tests.** Unless they are explicitly marked as `.skip` with a documented reason.

---

## Testing / Verification

Run all tests:

```bash
npm test
```

> ❓ Verify this command — see `../docs/ai/COMMANDS.md`.

---

## Do Not Break

- Existing passing tests
- The test command itself (`npm test` must succeed)

---

## Update Requirements

After adding or changing tests:

- `../docs/ai/TESTING.md` — if test framework, location, or command changed
- `../docs/ai/KNOWN_ISSUES.md` — if a new known test gap is discovered
- `../docs/ai/TASK_LOG.md` — always append a new entry
