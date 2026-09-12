# TESTING.md — Test and Validation Strategy

> **Last Updated**: 2026-09-12

## Automated suites

- `npm test`: 157 tests across 32 files (+1 env-gated real-model file): all previous coverage plus native-dependency validation (synthetic PE32/PE32+ import + delay-load parsing, bundled/native/declared classification, missing-file/hash/arch failures, committed-manifest consistency, release-pipeline wiring) alongside the AI generation-phase transitions (preparing/thinking/responding, failure/cancel clearing, hermetic manifest + injected fakes) and Thinking/Responding pill markup with aria-live and Stop affordance.
- `node scripts/verify-native-dependencies.cjs resources/ai/runtime`: release-time PE import scan of the AI runtime directory; fails with `binary -> dependency -> strategy` lines when a non-Windows dependency is neither bundled nor declared in `resources/ai/vc-runtime.json`. Also runs pre-packaging inside `npm run release*` and against the packaged payload inside `verify:release:security`.
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
- Release-closure runtime campaign (2026-09-12, same workstation/CPU/RAM, full record in `artifacts/release-closure-2026-09-12.json`):
  - Search under inference (294-row index, 30–40 probes/phase): baseline median 2.6 ms (p95 6.8, max 9.1); model-idle median 2.6 ms; generating medians 1.4–1.6 ms (p95 ≤ 3.3) at 4/5/6 threads — no measurable degradation; Electron < 3% CPU, ~322 MB; llama ~14.4 GB, 50–73% total CPU.
  - Thread matrix: decode flat (server 2.28–2.34 tok/s; bench tg64 2.57–2.58; bench pp32 8.15/8.60/9.42 for 4/5/6) — decode is bandwidth-bound, so the default 6 threads are retained with no production change.
  - First-visible-token anatomy (SSE stage timing, reasoning never stored): constrained prompts ~30 s (≈1–6 s prompt eval + ≈25 s reasoning); open-ended 400-word prompt 293–380 s (687–858 reasoning tokens, ±15% run variance); warm reuse 173–178 s. Hidden reasoning dominates; motivates the Thinking/Responding phase UX.
  - Cold starts (page-cache warm): direct server 10.1–11.2 s; app runtime 6.9–7.5 s. True post-reboot cold remains a user step.
  - Offline isolation suite 27/27 (DNS-blackholed process, isolated profile): startup, search, AI open, zero pre-ready runtime, cold model start, constrained generation + streaming + persistence, cancel during reasoning (0 deltas, nothing persisted), second generation, reload persistence, loopback-only connected flows and listeners, graceful exit 0, zero orphans. OS firewall-rule isolation was blocked (Error 5, non-elevated); physical unplug remains the gold-standard user step.
  - Portable wrapper matrix 8/8 healthy; exit code 2 not reproduced (see KNOWN_ISSUES).

## Remaining environment tests

- Public-certificate clean-machine runs (no Sandbox/Hyper-V/elevation in the agent session; enablement needs elevation). Source closure is done: the runtime dir now bundles the sanctioned app-local VC++ DLLs and the gate passes on it (53 binaries) while failing the old 1.0.1 payload (96 unresolved entries); loaded-module evidence proves app-local resolution. A fresh package + clean-machine confirmation remain.
- Physical-unplug offline rerun (isolation-level suite passed 27/27; one-command handoff pending).
- One-million-file execution.
- ACL-denied, offline OneDrive, network, HDD/external, storage-full, and read-only media.
- Deliberate native worker crash injection; restart recovery and forced worker error are covered.
- Direct Outlook and Excel copy/paste testing across Office versions; automated coverage validates dual-format generation/TSV conversion and the production renderer interaction path.
