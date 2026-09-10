# Prompt 05 — Start Any New Coding Task With Memory

Use this before asking Claude Code to implement any future feature, bug fix, refactor, or review.

Replace the `TASK` section with your real task.

```md
You are working inside this repository.

Before implementing anything, load and follow the project memory and agent instructions.

## Required reading first

Read these files before editing code:

```text
AGENTS.md
CLAUDE.md
docs/ai/PROJECT_BRIEF.md
docs/ai/CURRENT_STATE.md
docs/ai/RULES.md
docs/ai/COMMANDS.md
docs/ai/KNOWN_ISSUES.md
docs/ai/ARCHITECTURE.md
docs/ai/TESTING.md
docs/ai/DEVELOPMENT_WORKFLOW.md
```

Also read any local `AGENTS.md` files in the folders you will modify.

## Work rules

- Inspect relevant source files before editing.
- Make minimal safe changes.
- Do not perform unrelated refactors.
- Preserve existing behavior unless the task explicitly changes it.
- Follow existing architecture and coding style.
- Update or add tests when changing logic.
- Run relevant tests or explain why they could not be run.
- Do not hardcode secrets or environment-specific values.
- Update project memory after the task if state, behavior, commands, architecture, known issues, or features changed.

## TASK

Implement the following task:

```text
PASTE YOUR TASK HERE
```

## Completion requirements

When finished:

1. Summarize the implementation.
2. List files changed.
3. List tests run.
4. List tests not run and why.
5. Update `docs/ai/CURRENT_STATE.md` if project state changed.
6. Update `docs/ai/TASK_LOG.md` with a new entry.
7. Update `docs/ai/KNOWN_ISSUES.md` if the task revealed repeated bugs, fragile areas, or risky assumptions.
8. Mention any remaining risks or manual verification needed.
```
