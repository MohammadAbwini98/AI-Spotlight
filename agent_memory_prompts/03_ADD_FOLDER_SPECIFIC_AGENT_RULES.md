# Prompt 03 — Add Folder-Specific Agent Rules

Run this after Prompt 02 finishes.

```md
You are working inside an existing software project repository.

Your task is to add folder-specific `AGENTS.md` files where they will help future AI agents follow local rules for specific parts of the codebase.

Do not implement product features.
Do not refactor application code.
Do not change runtime behavior.
Only create or update local AI-agent instruction files.

## Step 1: Inspect repository folders

Review the repository tree and identify major folders such as:

- frontend
- backend
- src
- app
- server
- client
- api
- services
- workers
- runner
- scripts
- tests
- docs
- database
- migrations
- config
- packages
- apps
- libs

Only create local `AGENTS.md` files for folders that actually exist and where folder-specific guidance is useful.

## Step 2: Create local AGENTS.md files only where useful

Examples:

```text
frontend/AGENTS.md
backend/AGENTS.md
src/AGENTS.md
tests/AGENTS.md
scripts/AGENTS.md
docs/AGENTS.md
runner/AGENTS.md
services/AGENTS.md
```

Do not create meaningless files in every folder.
Prefer fewer, high-value files.

## Step 3: Write practical local rules

Each local `AGENTS.md` should be short and practical.

It should include only rules relevant to that folder.

Possible sections:

```md
# Local Agent Rules

## Scope

## Required Reading

## Local Rules

## Testing / Verification

## Do Not Break

## Update Requirements
```

## Backend/API folder rules

If a backend/API folder exists, include rules such as:

- Follow existing API patterns
- Preserve response contracts unless task requires changes
- Keep validation and error handling consistent
- Add migrations for database schema changes
- Do not hardcode secrets
- Update API documentation or frontend API usage when contracts change
- Add or update tests for service/business logic changes

Base the final wording on actual repository patterns.

## Frontend/UI folder rules

If a frontend/UI folder exists, include rules such as:

- Follow existing component structure
- Preserve routes and dashboard layout unless the task requires changes
- Keep API calls in existing API/client/service layers
- Avoid introducing new UI frameworks without explicit instruction
- Keep state management consistent with existing patterns
- Verify important user flows after changes

Base the final wording on actual repository patterns.

## Tests folder rules

If a tests folder exists, include rules such as:

- Follow existing test framework and naming conventions
- Add regression tests for bug fixes
- Keep tests deterministic
- Avoid relying on external services unless existing tests already do so
- Document tests that cannot be run locally

Base the final wording on actual repository patterns.

## Scripts folder rules

If a scripts folder exists, include rules such as:

- Scripts should be safe and repeatable where possible
- Avoid destructive defaults
- Document required environment variables
- Avoid printing secrets
- Prefer dry-run or confirmation for destructive actions

Base the final wording on actual repository patterns.

## Docs folder rules

If a docs folder exists, include rules such as:

- Keep documentation accurate and evidence-based
- Update related docs when behavior changes
- Mark unknowns clearly
- Do not copy secrets into docs

## Step 4: Update root memory docs

After adding local `AGENTS.md` files, update:

- `docs/ai/ARCHITECTURE.md` if the folder map changed or became clearer
- `docs/ai/DEVELOPMENT_WORKFLOW.md` to explain that agents must follow local `AGENTS.md` files
- `docs/ai/TASK_LOG.md` with this task entry

## Step 5: Validate

Check that:

- Local `AGENTS.md` files are only in existing folders
- Local rules do not conflict with root `AGENTS.md`
- Local rules are not too long
- Local rules point back to root/project memory when needed
- No secrets are included

## Final response format

At the end, respond with:

1. Local `AGENTS.md` files created
2. Local `AGENTS.md` files modified
3. Why each folder needed local rules
4. Memory files updated
5. Any folders intentionally skipped and why
6. Remaining recommendations
```
