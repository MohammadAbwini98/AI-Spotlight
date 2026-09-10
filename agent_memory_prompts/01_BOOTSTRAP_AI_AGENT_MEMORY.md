# Prompt 01 — Bootstrap AI Agent Memory Structure

Copy and run this prompt in **Claude Code** from the repository root.

```md
You are working inside an existing software project repository.

Your task is to review the repository and create a complete AI-agent memory and instruction structure for future work by Claude Code, OpenAI Codex, and Gemini.

The goal is to make future AI agents understand, remember, and always follow the project context, rules, architecture, features, commands, known issues, decisions, and important notes.

Do not implement new product features in this task.
Do not refactor application code.
Do not change runtime behavior.
Focus only on repository review and AI memory/instruction documentation.

Accuracy is more important than completeness.
Do not guess.
Do not invent features.
Use actual repository evidence.
If something is unclear, mark it as `Unknown / Needs Verification`.

## Step 1: Review the repository

Inspect the project structure carefully.

Review these areas if they exist:

- Root files
- README files
- Existing documentation
- Package/dependency files
- Backend source folders
- Frontend source folders
- Shared libraries
- Runner/worker/service folders
- Test folders
- Scripts
- Config files
- Docker/deployment files
- Database/migration files
- CI/CD files
- TODO/FIXME comments
- Existing project-specific instruction files

Identify:

- Main technology stack
- Backend framework and architecture
- Frontend framework and architecture
- Database or storage layer
- API structure
- Services, workers, runners, schedulers, or automation components
- Test structure
- Build/run/dev commands
- Deployment or packaging setup
- Important configuration files
- Current implemented features
- In-progress or partially implemented features
- Known risks, TODOs, FIXME comments, repeated patterns, and fragile areas

## Step 2: Create the shared AI memory structure

Create this structure if it does not already exist:

```text
AGENTS.md
CLAUDE.md
GEMINI.md

docs/
  ai/
    PROJECT_BRIEF.md
    CURRENT_STATE.md
    FEATURES.md
    ARCHITECTURE.md
    COMMANDS.md
    RULES.md
    KNOWN_ISSUES.md
    TASK_LOG.md
    DECISIONS.md
    SECURITY.md
    TESTING.md
    DEVELOPMENT_WORKFLOW.md
```

## Step 3: Root AGENTS.md

Create or update `AGENTS.md` as the main shared instruction file for AI coding agents.

It must include:

- Purpose of the file
- Required reading order
- Project documentation map
- General coding rules
- Testing rules
- Documentation update rules
- Security rules
- End-of-task checklist
- Rules for updating `docs/ai/CURRENT_STATE.md`
- Rules for updating `docs/ai/TASK_LOG.md`
- Rules for adding repeated problems to `docs/ai/KNOWN_ISSUES.md`

Keep `AGENTS.md` concise and practical.
It should point to detailed files under `docs/ai/` instead of containing all details itself.

## Step 4: CLAUDE.md

Create or update `CLAUDE.md`.

It should reference the shared rules in `AGENTS.md`.

Use this import line at the top when supported:

```md
@AGENTS.md
```

Include Claude Code-specific behavior:

- Read `AGENTS.md` first
- Read relevant `docs/ai/*.md` files before editing
- Use plan mode for large or risky changes
- Inspect files before modifying them
- Prefer minimal diffs
- Avoid unrelated refactors
- Update project memory files after each task
- Summarize changes and tests at the end

## Step 5: GEMINI.md

Create or update `GEMINI.md`.

It should reference the shared rules in `AGENTS.md`.

Use this import line at the top when supported:

```md
@AGENTS.md
```

Include Gemini-specific behavior:

- Read the shared repository instructions
- Use `docs/ai/` as the source of truth
- Inspect implementation files before making changes
- Keep responses aligned with the current architecture
- Avoid assumptions when repository evidence is missing
- Update memory files after each task

## Step 6: Populate docs/ai files

Generate useful content for each file using repository evidence.

### `docs/ai/PROJECT_BRIEF.md`

Include:

- What this project is
- Main goal
- Main users
- Main workflows
- High-level modules
- What the project is not
- Confirmed facts
- Inferred facts
- Unknowns / needs verification

### `docs/ai/CURRENT_STATE.md`

Include:

- Last updated date
- What currently works
- What is partially implemented
- What appears broken or risky
- What must not be broken
- Current technical debt
- Current next logical steps
- Unknowns / needs verification

### `docs/ai/FEATURES.md`

Include:

- Existing features
- Planned or implied features
- Incomplete features
- Feature ownership by module
- Important feature dependencies

### `docs/ai/ARCHITECTURE.md`

Include:

- Folder/module map
- Backend architecture
- Frontend architecture
- Database/storage architecture
- External integrations
- Data flow
- Runtime flow
- Important architectural constraints
- Unknowns / needs verification

### `docs/ai/COMMANDS.md`

Include actual detected commands only.

Cover:

- Install dependencies
- Run development server
- Run backend
- Run frontend
- Run tests
- Run linting/type checks
- Build
- Package
- Database migrations
- Useful scripts

If a command is unknown, write `Unknown - verify before use`.

### `docs/ai/RULES.md`

Include:

- Non-negotiable project rules
- Coding style rules
- Architecture rules
- API contract rules
- Database rules
- UI rules
- Logging rules
- Error handling rules
- Dependency rules
- Documentation rules

Rules must be based on existing project patterns.

### `docs/ai/KNOWN_ISSUES.md`

Include:

- Bugs found from TODO/FIXME/comments
- Fragile areas
- Risky assumptions
- Incomplete implementations
- Repeated problems
- Areas requiring manual verification

Do not exaggerate.
Use repository evidence.

### `docs/ai/TASK_LOG.md`

Create an initial entry:

- Date
- Agent: Claude Code
- Task: Created AI project memory structure
- Files created/updated
- Summary of repository understanding
- Tests run
- Tests not run

### `docs/ai/DECISIONS.md`

Include important decisions already visible in the repository.

For each decision:

- Date if known
- Decision
- Reason
- Impact
- Related files

If no clear decisions are found, create the file with a placeholder section.

### `docs/ai/SECURITY.md`

Include:

- Secret handling rules
- Environment variable rules
- API key/token rules
- Logging restrictions
- Safe handling of user data
- Dependency/security notes
- Files that should never contain secrets

Do not copy actual secrets into documentation.

### `docs/ai/TESTING.md`

Include:

- Existing test framework
- Test locations
- How to run tests
- Required test behavior for future changes
- Manual verification checklist
- Known test gaps

### `docs/ai/DEVELOPMENT_WORKFLOW.md`

Include:

- How future agents should start work
- How to inspect context
- How to make safe changes
- How to test
- How to update memory
- How to finish a task
- What to report at the end

## Step 7: Documentation safety rules

Every generated file must distinguish between:

- Confirmed from repository
- Inferred from repository structure
- Unknown / needs verification

Use these sections where useful:

```md
## Confirmed

## Inferred

## Unknown / Needs Verification
```

Do not include secrets, passwords, tokens, API keys, private certificates, session values, or production credentials.
If secret-like values are found, mention only that secret-like values exist and where they should be reviewed manually.

## Step 8: Final validation

After creating the files:

- Check that all Markdown files are readable
- Check that paths mentioned actually exist or are clearly marked as unknown
- Check that no secrets were copied into documentation
- Check that instructions do not conflict with each other
- Check that `CLAUDE.md` and `GEMINI.md` correctly point to the shared rules
- Check that `AGENTS.md` is concise and delegates details to `docs/ai/`

## Final response format

When finished, respond with:

1. Summary of what you created or updated
2. List of files created
3. List of files modified
4. Important repository observations
5. Commands/tests run
6. Commands/tests not run and why
7. Unknowns that need human verification
8. Recommended next steps

Remember: this task is documentation and AI-agent memory setup only. Do not implement unrelated code changes.
```
