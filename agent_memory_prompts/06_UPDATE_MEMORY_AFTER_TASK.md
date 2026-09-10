# Prompt 06 — Update Memory After a Completed Task

Use this after Claude Code finishes implementing a feature, bug fix, refactor, or review.

```md
Update the AI-agent memory files for this repository based on the latest completed task.

Review the current git diff and the relevant changed files.

Do not implement new product features.
Do not refactor unrelated code.
Only update the project memory files that need to change.

## Required updates

### 1. Update `docs/ai/CURRENT_STATE.md`

Update only if project state changed.

Include:

- What now works
- What changed
- What is still incomplete
- Any new risk
- Any manual verification needed
- Any next logical step

### 2. Update `docs/ai/TASK_LOG.md`

Add a new entry with:

- Date
- Agent/tool used: Claude Code
- Task summary
- Files changed
- Tests run
- Tests not run
- Result
- Remaining notes

### 3. Update `docs/ai/KNOWN_ISSUES.md`

Only add items if the task revealed:

- A repeated bug
- A fragile implementation
- A missing test
- A risky assumption
- A manual step that future agents must remember
- A limitation that is likely to affect future work

### 4. Update `docs/ai/FEATURES.md`

Only if a feature was:

- Added
- Removed
- Renamed
- Significantly changed
- Partially implemented
- Marked complete

### 5. Update `docs/ai/ARCHITECTURE.md`

Only if architecture changed, including:

- Module boundaries
- Data flow
- API contracts
- Storage/database behavior
- External integrations
- Runtime flow
- Service responsibilities

### 6. Update `docs/ai/COMMANDS.md`

Only if commands changed, including:

- Setup commands
- Build commands
- Test commands
- Lint/type-check commands
- Database/migration commands
- Packaging/deployment commands
- Useful scripts

### 7. Update `docs/ai/TESTING.md`

Only if testing behavior changed, including:

- New test framework
- New test location
- New verification command
- New manual verification requirement
- Known test gap

### 8. Update `docs/ai/DECISIONS.md`

Only if an important product, technical, or architecture decision was made.

Record:

- Date
- Decision
- Reason
- Impact
- Related files

## Editing rules

- Do not rewrite all documentation unnecessarily.
- Prefer small, accurate updates.
- Do not invent information.
- Mark unknowns clearly.
- Keep documentation based on actual repository state.
- Do not copy secrets into documentation.

## Final response format

At the end, respond with:

1. Memory files updated
2. Why each file was updated
3. Important project context future agents should know
4. Tests/checks run
5. Remaining unknowns or risks
```
