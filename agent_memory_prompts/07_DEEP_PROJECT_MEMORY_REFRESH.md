# Prompt 07 — Deep Project Memory Refresh

Use this occasionally when the project has changed a lot or when agent memory files become outdated.

```md
Perform a deep refresh of the repository AI-agent memory files.

This is a documentation and memory-maintenance task only.
Do not implement product features.
Do not refactor application code.
Do not change runtime behavior.

## Goal

Bring the project memory files back in sync with the actual repository state.

Review:

- Current git status
- Recent git log if available
- Root files
- README files
- Existing documentation
- Backend/source folders
- Frontend/source folders
- API routes/contracts
- Database/migration files
- Tests
- Scripts
- Config files
- CI/CD files
- Build/deployment/package files
- TODO/FIXME comments
- Current `docs/ai/` files
- Root and local `AGENTS.md` files
- `CLAUDE.md`
- `GEMINI.md`

## Files to update if needed

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
*/AGENTS.md
```

## Requirements

- Remove outdated memory entries or mark them as historical.
- Keep confirmed facts separate from inferred facts.
- Mark unknowns clearly.
- Verify commands against repository evidence.
- Keep root `AGENTS.md` concise.
- Keep detailed context under `docs/ai/`.
- Ensure local `AGENTS.md` files are still relevant.
- Ensure `CLAUDE.md` and `GEMINI.md` still point to shared rules.
- Do not include secrets.

## Final response format

At the end, respond with:

1. Memory refresh summary
2. Files updated
3. Outdated information removed or corrected
4. New confirmed project facts
5. Remaining unknowns
6. Recommended next maintenance date or trigger
```
