# COMMANDS.md — Confirmed Commands

> **Last Updated**: 2026-09-12

Node.js 22.12 or newer is required by Electron 43, Vite, Vitest, electron-builder, and the fuse tooling. The exact Node 22.12 development runtime is pinned in `devDependencies` and `.nvmrc`; after `npm install`, npm scripts resolve the repository-local runtime even when an older global Node remains on `PATH`.

| Command | Purpose |
|---|---|
| `npm run dev` | Electron/Vite development mode through the pinned Node runtime; removes an inherited `ELECTRON_RUN_AS_NODE` override before launch |
| `npm run build` | Production main, worker, preload, and renderer bundles |
| `npm run typecheck` | Node and renderer TypeScript projects |
| `npm run lint` | ESLint for TypeScript/TSX |
| `npm test` | Vitest regressions |
| `npm run test:sync` | Real SQLite/worker lifecycle integration |
| `npm run benchmark:sync -- --profile=small\|medium\|large` | Legacy baseline (10k/100k/1m) |
| `npm run benchmark:sync:worker -- --profile=small\|medium\|large` | Worker/search/WAL benchmark |
| `npm run runtime:sync` | Production Electron 100k walkthrough |
| `npm run capture:design` | Production renderer visual captures |
| `npm run release:dry-run` | Preview versioned Portable/Setup paths and release checks without writing files |
| `npm run release` | Public release only: require an externally trusted signing credential, then typecheck, lint, test, build signed x64 DeepDive Portable + per-user Setup executables, validate signatures/migrations, and create a SHA-256 inventory under `release/DeepDive/<version>/` |
| `npm run release -- --force` | Replace an existing `release/DeepDive/<version>/` directory and run the complete guarded release workflow |
| `npm run release:local:dry-run` | Preview the private-use release paths under `release/local/DeepDive/<version>/` without creating a certificate or files |
| `npm run release:local` | Create/reuse the non-exportable Current User local signing key and build verified private-use Portable + Setup executables with a public `.cer` and trust instructions |
| `npm run release:local -- --force` | Replace an existing private-use version directory and rebuild it with the same local signing identity |
| `npm run package` | Alias for `npm run release` |
| `npm run package:win` | Alias for `npm run release` |
| `npm run verify:release:security` | Reject unsigned/unexpected signers, incomplete migrations, unresolved packaged native dependencies, and create the release SHA-256 inventory |
| `node scripts/verify-native-dependencies.cjs resources/ai/runtime` | PE import scan of the AI runtime dir: every non-Windows dependency must be bundled or declared in `resources/ai/vc-runtime.json` (also runs inside `release*` and `verify:release:security`) |
| `npm run release:split` | Optional distribution-only step: split the final signed Portable + Setup executables into verified 20 MB share packages (parts + manifest + `Reassemble.ps1` + README) under `release/share/<version>/`; never modifies the signed artifacts |
| `SPOTLIGHT_TODO_REAL_MODEL=1 SPOTLIGHT_TODO_QUAL_DATA=<dir> npx vitest run tests/ai-qualification.spec.ts` | Real-model qualification (15 tests, env-gated, excluded from default `npm test`); requires provisioned `resources/ai/runtime/llama-server.exe` plus a staged Q4_K_M GGUF |

Benchmark/runtime fixtures are deterministic OS-temporary files and are removed after completion. JSON evidence is written under `artifacts/`. Migrations run automatically from `electron/main/db/migrations/`.

Public Windows signing uses electron-builder's environment-based credentials such as `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, or an eligible non-self-signed certificate in the Windows certificate store. The workflow fails before building when neither is available; private Local Use and test certificates do not satisfy the public check. `SPOTLIGHT_TODO_SIGNER_SUBJECT` optionally pins the expected certificate subject during verification. Never store credential values in the repository. The Setup target is per-user (`perMachine: false`); the Portable target requires no installation.

`release:local` is only for personally controlled machines. Its private key is created as non-exportable in `Cert:\CurrentUser\My` and never enters the release directory; distribute only `DeepDive-Local.cer` with the two executables, then follow `LOCAL-CERTIFICATE-INSTALL.txt` on each additional personal Windows account.
