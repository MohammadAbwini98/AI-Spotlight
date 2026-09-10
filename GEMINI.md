# GEMINI.md — Gemini Agent Instructions

@AGENTS.md

---

## Gemini-Specific Behavior

This file extends the shared rules in `AGENTS.md` with Gemini-specific guidance.

### Before Making Changes

1. Read `AGENTS.md` — it is the single source of truth for shared project rules.
2. Read `docs/ai/CURRENT_STATE.md` to understand the live project state.
3. Read `docs/ai/RULES.md` for non-negotiable coding constraints.
4. Read `docs/ai/ARCHITECTURE.md` to understand module boundaries and data flow.
5. Read the local `AGENTS.md` in any folder you will modify.
6. Inspect actual implementation files before editing them — do not assume their content.

### While Editing

- Keep responses and code changes aligned with the current architecture.
- Do not introduce new patterns, frameworks, or dependencies without an explicit instruction to do so.
- Avoid assumptions when repository evidence is missing — mark items as `Unknown / Needs Verification`.
- Follow existing naming conventions, file structure, and coding style.
- Never hardcode secrets, tokens, or environment-specific values.

### After Changes

1. Run relevant tests or explain why they could not be run.
2. Update `docs/ai/CURRENT_STATE.md` if project state, features, or architecture changed.
3. Append a new entry to `docs/ai/TASK_LOG.md`.
4. Update `docs/ai/KNOWN_ISSUES.md` if the task revealed new fragile areas or risks.
5. Report all changes and any remaining manual verification steps.

### Key Source of Truth

`docs/ai/` contains the living documentation for this project.
Always consult these files before acting on assumptions.
