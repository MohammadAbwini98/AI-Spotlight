# Prompt 04 — Final Verification Before Commit

Run this after Prompt 03 finishes.

```md
You are working inside an existing software project repository.

Perform a final verification of the AI-agent memory setup before commit.

Review these files and folders:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
docs/ai/
*/AGENTS.md
```

Do not implement product features.
Do not refactor application code.
Only fix documentation or instruction issues related to the AI-agent memory setup.

## Verification checklist

### 1. File existence

Verify these required files exist:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
docs/ai/PROJECT_BRIEF.md
docs/ai/CURRENT_STATE.md
docs/ai/FEATURES.md
docs/ai/ARCHITECTURE.md
docs/ai/COMMANDS.md
docs/ai/RULES.md
docs/ai/KNOWN_ISSUES.md
docs/ai/TASK_LOG.md
docs/ai/DECISIONS.md
docs/ai/SECURITY.md
docs/ai/TESTING.md
docs/ai/DEVELOPMENT_WORKFLOW.md
```

### 2. Agent compatibility

Verify:

- `AGENTS.md` is useful for Codex and other agents
- `CLAUDE.md` correctly points Claude Code to shared rules
- `GEMINI.md` correctly points Gemini to shared rules
- Local `AGENTS.md` files do not conflict with root rules
- Instructions have a clear reading order

### 3. Accuracy

Verify:

- Project facts are backed by repository evidence
- Unknowns are clearly marked
- No invented features are documented as confirmed
- No commands are listed as confirmed unless repository evidence supports them
- Current state reflects the actual codebase

### 4. Safety

Verify:

- No secrets are included
- No passwords, tokens, API keys, certificates, or session values are included
- No private production credentials are included
- Security rules are clear enough for future agents

### 5. Maintainability

Verify:

- `AGENTS.md` is not overloaded with too much project detail
- Detailed context is in `docs/ai/`
- `CURRENT_STATE.md` explains what works and what is incomplete
- `TASK_LOG.md` has a useful initial entry
- Future agents are instructed to update memory after every task

### 6. Markdown quality

Verify:

- Markdown renders cleanly
- Headings are consistent
- Code fences are closed
- File paths are formatted clearly
- No broken internal references are obvious

## Required output after fixes

Update `docs/ai/TASK_LOG.md` with a final verification entry.

Then respond with:

1. Final verification result
2. Files checked
3. Issues fixed
4. Remaining unknowns
5. Recommended files to commit
6. Suggested commit message
7. How future agents should use this memory setup
```
