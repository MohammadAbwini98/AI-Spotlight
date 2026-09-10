# AI Agent Memory Setup — Execution Order

Use these prompts with **Claude Code** inside the root of your existing repository.

The goal is to make **Claude Code**, **OpenAI Codex**, and **Gemini** consistently understand and follow your project context, rules, architecture, features, commands, known issues, and important notes.

## Recommended execution order

1. `01_BOOTSTRAP_AI_AGENT_MEMORY.md`  
   Creates the main memory/instruction structure.

2. `02_AUDIT_AND_CORRECT_AI_MEMORY.md`  
   Reviews the generated files for accuracy, conflicts, missing information, and wrong assumptions.

3. `03_ADD_FOLDER_SPECIFIC_AGENT_RULES.md`  
   Adds local `AGENTS.md` files to important folders such as backend, frontend, tests, scripts, docs, runner, services, etc.

4. `04_FINAL_VERIFICATION.md`  
   Performs final validation before you commit the memory files.

5. `05_START_NEW_TASK_WITH_MEMORY.md`  
   Use this before any future coding task so the agent reads and follows the project memory.

6. `06_UPDATE_MEMORY_AFTER_TASK.md`  
   Use this after every feature, bug fix, or refactor so the project memory stays updated.

## Best practice

Commit these files after Claude Code generates them:

```text
AGENTS.md
CLAUDE.md
GEMINI.md
docs/ai/**
*/AGENTS.md where useful
```

Do not rely on chat memory only. The repository must become the source of truth.
