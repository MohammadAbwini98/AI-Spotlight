# Prompt 02 — Audit and Correct AI Memory Files

Run this after Prompt 01 finishes.

```md
You are working inside an existing software project repository.

Audit the AI-agent memory and instruction files created for this repository.

Review:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
docs/ai/
```

Do not make unrelated application code changes.
Do not implement product features.
Do not refactor source code.
This task is only for verifying and improving the AI-agent memory files.

## Audit goals

Check for:

- Incorrect assumptions
- Invented features
- Outdated information
- Duplicated instructions
- Conflicting rules
- Missing project context
- Missing commands
- Missing testing instructions
- Missing security rules
- Overly long root instruction files
- Unclear end-of-task checklist
- Paths that do not exist
- Commands that are not backed by repository evidence
- Documentation that is not based on repository evidence

## Required checks

### 1. Check root agent files

Verify:

- `AGENTS.md` is the shared root instruction file
- `AGENTS.md` is concise and delegates detailed context to `docs/ai/`
- `CLAUDE.md` references or imports `AGENTS.md`
- `GEMINI.md` references or imports `AGENTS.md`
- The three files do not conflict with each other
- End-of-task update rules are clear

### 2. Check docs/ai files

Verify each file is useful and accurate:

- `PROJECT_BRIEF.md`
- `CURRENT_STATE.md`
- `FEATURES.md`
- `ARCHITECTURE.md`
- `COMMANDS.md`
- `RULES.md`
- `KNOWN_ISSUES.md`
- `TASK_LOG.md`
- `DECISIONS.md`
- `SECURITY.md`
- `TESTING.md`
- `DEVELOPMENT_WORKFLOW.md`

Each file should clearly separate:

- Confirmed from repository
- Inferred from repository structure
- Unknown / needs verification

### 3. Check commands

For every command listed in `docs/ai/COMMANDS.md`, verify it comes from actual repository evidence such as:

- `package.json`
- `.csproj`
- `.sln`
- `pyproject.toml`
- `requirements.txt`
- `Makefile`
- Docker files
- README files
- scripts
- CI files

Remove or mark as unknown any command that cannot be verified.

### 4. Check security

Verify no secrets were copied into Markdown files.

Do not include:

- API keys
- Tokens
- Passwords
- Private certificates
- Session values
- Production credentials
- Private URLs with sensitive parameters

If secret-like values are found, remove them and replace them with a safe note.

### 5. Check maintainability

Improve the files so future agents can quickly understand:

- What the project does
- How to run it
- How to test it
- What not to break
- What is currently incomplete
- What rules must always be followed
- How to update memory after each task

## Editing rules

- Prefer small, accurate corrections.
- Do not rewrite everything unnecessarily.
- Do not invent missing information.
- Mark unknowns clearly.
- Keep `AGENTS.md` concise.
- Keep detailed project knowledge inside `docs/ai/`.
- Ensure future agents are instructed to update `CURRENT_STATE.md` and `TASK_LOG.md` after every task.

## Final response format

At the end, respond with:

1. Issues found
2. Files improved
3. Important corrections made
4. Commands verified
5. Commands marked as unknown
6. Remaining unknowns
7. Recommended next maintenance rule
```
