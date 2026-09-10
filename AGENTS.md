# AGENTS.md — AI Agent Instructions (Root)

> **Read this first.** Every AI coding agent (Claude Code, OpenAI Codex, Gemini, etc.) must read this file before editing any code in this repository.

---

## Purpose

This file is the shared instruction hub for all AI agents working in this repository.
It provides reading order, general rules, and pointers to detailed context files.
All detailed context lives under `docs/ai/`.

---

## Required Reading Order

Before editing any file, read in this order:

1. `AGENTS.md` ← this file
2. `docs/ai/PROJECT_BRIEF.md` — what this project is
3. `docs/ai/CURRENT_STATE.md` — what works, what is incomplete, what must not break
4. `docs/ai/RULES.md` — non-negotiable coding and architecture rules
5. `docs/ai/ARCHITECTURE.md` — folder map, data flow, module boundaries
6. `docs/ai/COMMANDS.md` — how to run, build, and test
7. `docs/ai/KNOWN_ISSUES.md` — fragile areas, known bugs, risky assumptions
8. Any local `AGENTS.md` inside the folder(s) you will modify

---

## Project Documentation Map

| File | Purpose |
|------|---------|
| `docs/ai/PROJECT_BRIEF.md` | What the project is, who uses it, main workflows |
| `docs/ai/CURRENT_STATE.md` | Live project status — update after every task |
| `docs/ai/FEATURES.md` | Feature inventory by module |
| `docs/ai/ARCHITECTURE.md` | Folder map, module boundaries, data flow |
| `docs/ai/COMMANDS.md` | All known run/build/test/lint commands |
| `docs/ai/RULES.md` | Coding, architecture, UI, security, and documentation rules |
| `docs/ai/KNOWN_ISSUES.md` | Bugs, fragile areas, TODOs, risks |
| `docs/ai/TASK_LOG.md` | History of agent tasks — append after every task |
| `docs/ai/DECISIONS.md` | Key architectural and product decisions |
| `docs/ai/SECURITY.md` | Secret handling, env var rules, security constraints |
| `docs/ai/TESTING.md` | Test framework, locations, how to run, coverage gaps |
| `docs/ai/DEVELOPMENT_WORKFLOW.md` | How to safely start, make, test, and finish changes |

---

## General Coding Rules

- Follow the existing architecture and coding style — do not introduce new patterns without a documented reason.
- Make minimal, safe diffs. Do not refactor code unrelated to the current task.
- Never hardcode secrets, passwords, API keys, or environment-specific values.
- Inspect files before modifying them.
- Preserve existing behavior unless the task explicitly requires changing it.
- If something is unclear, mark it `Unknown / Needs Verification` — do not guess.

---

## Testing Rules

- Run all relevant tests before and after changes.
- Add or update tests when changing business logic.
- If tests cannot be run, explain why in the task completion report.
- See `docs/ai/TESTING.md` for the test framework, locations, and manual verification steps.

---

## Documentation Update Rules

After every task, update:

- `docs/ai/CURRENT_STATE.md` — if project state, features, or architecture changed
- `docs/ai/TASK_LOG.md` — always append a new entry
- `docs/ai/KNOWN_ISSUES.md` — if the task revealed new bugs, fragile code, or risks
- `docs/ai/FEATURES.md` — if a feature was added, removed, or changed
- `docs/ai/ARCHITECTURE.md` — if module boundaries or data flow changed

---

## Security Rules

- Never copy secrets, tokens, API keys, or credentials into documentation or code comments.
- Use environment variables for all secrets. See `docs/ai/SECURITY.md`.
- Never log sensitive user data.
- Review `.gitignore` — ensure `.env` and secret files are excluded.

---

## End-of-Task Checklist

Before finishing any task:

- [ ] All changed files reviewed and tested
- [ ] Tests run or reason for skipping documented
- [ ] `docs/ai/CURRENT_STATE.md` updated if state changed
- [ ] `docs/ai/TASK_LOG.md` updated with a new entry
- [ ] `docs/ai/KNOWN_ISSUES.md` updated if new risks found
- [ ] No secrets added to any file
- [ ] No unrelated files changed
- [ ] Summary of changes reported to the user
