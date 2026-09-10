# Local Agent Rules — docs/

> Also read: `../AGENTS.md` before editing this folder.

---

## Scope

This folder contains all **project documentation**, including:

- `docs/ai/` — AI agent memory files (living documentation)
- Any user-facing or developer-facing docs

---

## Required Reading

Before editing this folder:

- `../AGENTS.md`

---

## Local Rules

1. **Accuracy over completeness.** Only document what is confirmed. Mark inferences as 🔵 and unknowns as ❓.
2. **Evidence-based.** Every claim in the documentation must be backed by repository evidence. Do not invent features or behaviors.
3. **No secrets.** Never copy API keys, passwords, tokens, or credentials into any documentation file.
4. **Keep `docs/ai/` updated.** The AI memory files (`docs/ai/`) are a living document. Update them after every task using the prompts in `../agent_memory_prompts/`.
5. **Mark unknowns clearly.** Use `Unknown / Needs Verification` sections or ❓ inline markers for anything not confirmed by the codebase.
6. **Update related docs when behavior changes.** If a feature, command, or architecture decision changes, update the relevant `docs/ai/` file in the same task.

---

## AI Memory Files Maintenance

| File | When to Update |
|------|---------------|
| `docs/ai/CURRENT_STATE.md` | After every task that changes project state |
| `docs/ai/TASK_LOG.md` | After every agent task (always) |
| `docs/ai/FEATURES.md` | When features are added, changed, or removed |
| `docs/ai/ARCHITECTURE.md` | When modules, data flow, or IPC changes |
| `docs/ai/COMMANDS.md` | When scripts or commands change |
| `docs/ai/KNOWN_ISSUES.md` | When new bugs or risks are found |
| `docs/ai/DECISIONS.md` | When important product/tech decisions are made |

---

## Do Not Break

- The reading order defined in `../AGENTS.md`
- Internal references between `docs/ai/` files
- Markdown formatting (code fences must be balanced)

---

## Update Requirements

After significant documentation changes:

- `../docs/ai/TASK_LOG.md` — always append a new entry
