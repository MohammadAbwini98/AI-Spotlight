# DEVELOPMENT_WORKFLOW.md — Agent Work Workflow

> This document tells future AI agents exactly how to start, execute, and finish a task in this repository.

---

## Step 1 — Load Project Memory (Before Any Coding)

Before touching any file, read:

```
AGENTS.md                          ← shared instruction hub
docs/ai/PROJECT_BRIEF.md           ← what the project is
docs/ai/CURRENT_STATE.md           ← live project state
docs/ai/RULES.md                   ← non-negotiable rules
docs/ai/ARCHITECTURE.md            ← module map and data flow
docs/ai/COMMANDS.md                ← how to run/build/test
docs/ai/KNOWN_ISSUES.md            ← known bugs and fragile areas
```

Also read the local `AGENTS.md` for every folder you plan to edit:

```
app/main/AGENTS.md       (if editing the main process)
app/renderer/AGENTS.md   (if editing the renderer/UI)
src/AGENTS.md            (if editing shared logic)
scripts/AGENTS.md        (if editing scripts)
tests/AGENTS.md          (if editing tests)
docs/AGENTS.md           (if editing documentation)
```

---

## Step 2 — Inspect Context

- Inspect the actual source files you will edit. Do not assume their content.
- Check for TODO and FIXME comments in relevant files.
- Check `docs/ai/KNOWN_ISSUES.md` for fragile areas that may affect the task.
- Verify the commands you will use are in `docs/ai/COMMANDS.md`.

---

## Step 3 — Plan (for Large or Risky Changes)

If the task touches multiple modules, changes IPC contracts, modifies storage, or has significant risk:

1. Present a plan to the user first.
2. Wait for confirmation before making changes.
3. Break the task into small, reviewable steps.

For small, single-file, low-risk changes: proceed directly.

---

## Step 4 — Make Changes Safely

- Prefer minimal diffs.
- Do not refactor unrelated code.
- Preserve existing behavior unless the task explicitly changes it.
- Follow the architecture: renderer → IPC → main → storage. Never skip layers.
- Never hardcode secrets or environment-specific values.

---

## Step 5 — Test

After making changes:

```bash
npm test
```

> ❓ Verify the test command from `docs/ai/COMMANDS.md` before running.

If tests cannot be run, document why in the task completion report.

For UI or behavior changes, use the manual verification checklist in `docs/ai/TESTING.md`.

---

## Step 6 — Update Project Memory

After completing the task, update:

| File | Update When |
|------|------------|
| `docs/ai/CURRENT_STATE.md` | Project state, features, or architecture changed |
| `docs/ai/TASK_LOG.md` | Always — append a new entry |
| `docs/ai/KNOWN_ISSUES.md` | New bug, fragile area, or risk discovered |
| `docs/ai/FEATURES.md` | Feature added, removed, or changed |
| `docs/ai/ARCHITECTURE.md` | Module boundaries, IPC contracts, or data flow changed |
| `docs/ai/COMMANDS.md` | Commands changed or new scripts added |

---

## Step 7 — Report to the User

Provide:

1. Summary of changes made
2. Files changed
3. Tests run and results
4. Tests not run and why
5. Memory files updated
6. Any remaining risks or manual verification steps

---

## What to Never Do

- ❌ Never skip reading `AGENTS.md` and `CURRENT_STATE.md` before starting
- ❌ Never make changes without inspecting the actual source files
- ❌ Never add secrets to any file
- ❌ Never change IPC contracts without updating both sides
- ❌ Never refactor unrelated code in the same task
- ❌ Never skip updating `TASK_LOG.md` after finishing a task
