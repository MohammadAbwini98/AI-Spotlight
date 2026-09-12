# TESTING.md — Test and Validation Strategy

> **Last Updated**: 2026-09-12

## Automated suites

- `npm test`: 142 tests across 29 files (+1 env-gated real-model file): all previous coverage plus AI runtime configuration, model manifest/resolution/validation, llama.cpp loopback/spawn/health/SSE/error-taxonomy policy, AI IPC validation and narrow preload surface, AI conversation persistence and migration 011 schema, native import (progress/cancel/partial-cleanup/idempotent re-import), provider abstraction and search/AI separation audits, safe Markdown projection, and AI chat-view rendering states.
- `SPOTLIGHT_TODO_REAL_MODEL=1 SPOTLIGHT_TODO_QUAL_DATA=<dir> npx vitest run tests/ai-qualification.spec.ts`: 15/15 real-model tests against the production `AiRuntimeService` (short/multi-turn/long/Unicode/Markdown/streaming/cancel/reuse/busy/restart-reload/cascade/malformed-IPC/runtime-unavailable/model-unavailable/crash-recovery). Requires provisioned `resources/ai/runtime/llama-server.exe` and a staged Q4_K_M GGUF; excluded from the default gate by design.
- `npm run test:sync`: Electron-ABI real-file/worker/SQLite/WAL/FTS integration.
- `npm run typecheck`: Node and web TypeScript projects.
- `npm run build`: production main/worker/preload/renderer bundles.

## Sync integration coverage

- Canonical complete/warning/cancelled/failed states and terminal uniqueness.
- Persistent counters and newly-unavailable/restored counts.
- No-change timestamps and stable FTS rows; exact search.
- Targeted edit/delete/restore.
- Cancellation, incomplete traversal, and forced failure preserving availability.
- Junction-cycle exclusion, metadata-only traversal, and SQLite `quick_check`.
- Electron 43 / better-sqlite3 12 native ABI execution after dependency upgrade.

## Security/release coverage

- Runtime IPC bounds and renderer-writable settings whitelist.
- Relative/UNC/shared/system/sensitive-profile scan-root rejection.
- Portable wrapper persistence and OneDrive-to-LOCALAPPDATA fallback/evacuation.
- Dangerous executable/script/shortcut/URL launch blocking.
- Contiguous 001-009 migration inventory.
- SHA-256 release manifest tamper and injected-file detection.
- Versioned Portable/Setup artifact naming, safe release switches, per-user NSIS configuration, and mandatory dual-artifact checks.
- Private-use release isolation, non-exportable signing-key policy, public-only certificate output, Current User trust, and exact local signing identity checks.
- Inspection-only package fuse state and packaged migrations verified; unsigned artifact rejection verified.
- The complete local-use 1.0.0 package produced valid signatures for the unpacked app, Portable EXE, and Setup EXE; its migration inventory and SHA-256 manifest independently verified, and the exported `.cer` has no private key.
- The rebuilt signed local-use Portable started successfully, remained responsive while hidden, and changed its native window to visible after a synthesized system Ctrl+Space input.
- The corrected signed Portable target loaded `spotlight://renderer/index.html`, mounted React, loaded its same-origin stylesheet, exposed the expected search input, and produced a DPI-aware 1360x120 native capture of the complete compact UI on the workstation's 200% display.
- The rebuilt signed Portable returned a successful Settings IPC payload, exposed all four compact actions, opened Settings through the real button, rendered its heading/content/two selects/three toggles/storage path, and kept both wrapper and main processes responsive.
- The DeepDive 1.0.0 local release completed typecheck, lint, all 75 Vitest regressions, production build, Authenticode signing, migration verification, and SHA-256 inventory creation. Windows reported `ProductName=DeepDive` and extracted the generated application icon from the unpacked executable, Portable, and Setup files.
- The DeepDive 1.0.1 local patch release passed all 76 tests, typecheck, lint, production build, Authenticode signing, migration verification, and SHA-256 verification. Its packaged main bundle contains explicit shortcut/Escape hiding but no native blur-to-hide handler.
- Public packaging without an external signing credential now exits before build/output creation with an actionable `release:local` message; configured certificate links, eligible store certificates, and local mode are covered separately.

## Performance/runtime validation

- Baseline/final scripts generate 10k/100k/1m profiles.
- `runtime:sync` launches the production Electron bundle with 100,000 files and checks recovery, state transitions, search, Todo, duplicate rejection, rendering, and window controls.
- Evidence is under `artifacts/benchmarks/` and `artifacts/runtime/`.
- `capture:design` records `00-transparent-shell.png` before injecting its preview wallpaper so unused-window alpha can be inspected independently from component materials.
- `capture:design` exercises the production in-place rich Task note surface and verifies the contenteditable replacement, boundary-contained selection toolbar, slash-command keyboard execution/removal, table presence and block isolation, textarea removal, and existing outside dismissal.
- Migration 010 was executed over a legacy in-memory Electron-ABI SQLite database; original content, the plain/Markdown projections, task-search text, and `integrity_check=ok` were verified.

## Real-model measurements (2026-09-12, this workstation)

Hardware: Windows 10 10.0.19045, i7-4980HQ (8 logical), 32 GB RAM (22.6 free), 6 AI threads, ctx 8192. Runtime: llama-server b10909 CPU. Model: `gemma-4-12B-it-Q4_K_M.gguf`, 7,381,382,176 bytes.

- llama-bench: pp32 9.42 tok/s, tg64 2.57 tok/s (Haswell backend).
- Cold start: 11-51 s (disk cache dependent). First visible token: ~25-29 s — Gemma 4 emits an extensive `reasoning_content` preamble that the client deliberately ignores (never shown, never persisted); steady visible decode follows at hardware rate.
- Model-loaded RSS: ~14.8 GB. Cancel latency: ~16 ms (model stays loaded). Shutdown: ~1 s, zero orphan processes across repeated runs.
- Packaged CDP E2E (signed unpacked payload, isolated data dir): 12/12 — startup, search-only control, zero llama processes during search, chat open, streamed `PKG_AI_OK` assistant bubble, persisted turn in SQLite, graceful exit 0, no orphan server.

## Remaining environment tests

- Public-certificate clean-machine runs and portable-wrapper startup on this workstation (wrapper exits code 2; unpacked payload fully verified).
- One-million-file execution.
- ACL-denied, offline OneDrive, network, HDD/external, storage-full, and read-only media.
- Deliberate native worker crash injection; restart recovery and forced worker error are covered.
- Direct Outlook and Excel copy/paste testing across Office versions; automated coverage validates dual-format generation/TSV conversion and the production renderer interaction path.
