# CLAUDE.md — Claude Code Instructions

@AGENTS.md

---

## Claude Code-Specific Behavior

This file extends the shared rules in `AGENTS.md` with Claude Code-specific guidance.

### Before Editing

1. Read `AGENTS.md` completely.
2. Read relevant `docs/ai/*.md` files (especially `CURRENT_STATE.md`, `RULES.md`, `ARCHITECTURE.md`).
3. Read the local `AGENTS.md` in each folder you plan to modify.
4. Inspect the actual source files you will edit — do not assume content.

### While Editing

- Use **plan mode** for large, risky, or multi-file changes — present the plan and wait for confirmation.
- Prefer **minimal diffs** — change only what is needed for the task.
- Do not perform unrelated refactors in the same commit.
- Follow the existing code style, naming conventions, and module boundaries.
- Never hardcode environment-specific values or secrets.

### After Editing

1. Run relevant tests or explain why they could not be run.
2. Summarize all changes made.
3. Update `docs/ai/CURRENT_STATE.md` if project state changed.
4. Append a new entry to `docs/ai/TASK_LOG.md`.
5. Update `docs/ai/KNOWN_ISSUES.md` if the task revealed new risks.
6. Report any remaining manual verification steps to the user.

### End-of-Task Report Format

```
## Task Complete

### Changes Made
- List each file changed and what changed

### Tests Run
- List tests run and results

### Tests Not Run
- List and reason

### Memory Updated
- docs/ai/CURRENT_STATE.md: yes/no — reason
- docs/ai/TASK_LOG.md: yes — entry added
- docs/ai/KNOWN_ISSUES.md: yes/no — reason

### Remaining Risks / Manual Steps
- List anything the user needs to verify manually
```
