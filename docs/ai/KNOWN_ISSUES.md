# KNOWN_ISSUES.md — Current Risks and Limitations

> **Last Updated**: 2026-09-11

## Active

- **Local AI runtime not bundled:** `llama-server.exe` and its DLLs are not in the repository; place the pinned-minimum build under `resources/ai/runtime/` at packaging time (see `resources/ai/README.md`). Until then the AI screen reports `AI_RUNTIME_NOT_FOUND` with setup guidance.
- **Model provisioned offline:** the Gemma 4 12B Q4_K_M GGUF is not bundled and has no canonical SHA-256 yet (`verifySha256: false`); import it once via AI Chat → Select model file. Hash enforcement activates when a canonical hash ships in the manifest.
- **Real-model validation pending:** streaming, Stop-reuse, tokens/sec, RAM, cold-start, and quit-cleanliness with the actual 12B model are unexecuted on this workstation.
- **Model import progress:** large GGUF copies run async without blocking the renderer, but no byte-level progress UI is shown yet (P2).
- **Native blur variance:** transparent-window blur strength varies by Windows compositor/GPU; tint and Reduced Transparency preserve readability.
- **Native resize variance:** resizing the transparent BrowserWindow between compact and expanded heights can occasionally create a compositor frame outlier on Windows even when renderer animation frames remain at refresh cadence.
- **Watcher portability:** recursive `fs.watch` is Windows-validated. Reconciliation is required after downtime/trust loss; other platforms need validation.
- **Environment coverage:** the 1m profile and real OneDrive placeholder/ACL/storage-full/slow-disk scenarios remain unexecuted; UNC/network scan roots are now rejected by policy.
- **Packaging:** production bundles and the private signed Portable runtime passed; public-certificate packaging and clean-machine execution remain unverified.
- **Signing requirement:** `forceCodeSigning` intentionally prevents public release packaging until externally trusted Windows signing credentials are supplied. The fail-fast check excludes the private DeepDive/SpotlightTodo Local Use identities and unrelated self-signed test certificates; use `release:local` for personal builds.
- **Plaintext database:** SQLite paths, Todo data, and notes are protected by their non-roaming user-local location and inherited ACL, but are not cryptographically encrypted at rest.
- **Native toolchain:** Node 22.12+ is required. This workstation's 10.0.19041 SDK installation is incomplete, so the verified Electron 43 native build was retargeted to installed SDK 10.0.22621.
- **Ranking tradeoff:** broad search ranks the best 256-1,600 FTS candidates before open-frequency weighting; an extreme result outside that set cannot be promoted.
- **Office clipboard matrix:** rich Task notes emit safe HTML tables and TSV plain text and accept both formats, but direct Outlook/Excel version, theme, merged-cell, and complex workbook clipboard testing remains unexecuted on this workstation.

## Resolved

- Stale documentation that claimed application code did not exist.
- Invalid `success` state, inaccurate counters, and cumulative removal reporting.
- Main-thread traversal/index writes and unchanged-row/FTS rewrites.
- Roaming fallback storage and missing active-path diagnostics.
- Directory watcher self-events and Windows junction traversal.
- Database/WAL watcher feedback loops, repeated null-path warnings, and visible background-sync spinner churn.
- Missing Recent Files back navigation.
- Transparent dark-theme root canvas painting black.
- CSS transitions competing with Framer Motion and sync-progress rerenders of unchanged search results.
- Recent/Frequent queries scanning and temporarily sorting the full available-file index, two-stage panel loading, and a native resize occurring after the Recent transition started.
- Conditional selected-row refs and pointer-entry selection preventing reliable bidirectional keyboard scrolling through search results.
- A late universal compact-chrome override replacing the dedicated dark search and action-button tokens with light materials.
- Unsandboxed renderer, unrestricted session capabilities, missing IPC sender/runtime checks, settings-based scan-root bypasses, unsafe shell-launch types, and portable temporary-directory storage.
- Vulnerable Electron/build/test dependency graph; the current full npm audit reports zero vulnerabilities.
- Vite 7 `crypto.hash` startup failure when npm scripts inherited the workstation's global Node 18; scripts now resolve the pinned repository-local Node 22.12 runtime.
- Windows' default `WS_THICKFRAME`/system backdrop remaining behind the transparent frameless window; both are now explicitly disabled and DWM reports no extended frame bounds.
- Exterior compact/elevated Liquid Glass shadows visually joining into a black/gray application-frame halo; outward layers are removed while inset material highlights remain.
- Stale unsigned release in the normal output directory; it is now under `artifacts/quarantine/` and excluded from version control.
- A missing packaged tray image could interrupt startup before Ctrl+Space registration, leaving the taskbar-hidden overlay unreachable after blur; shortcut setup is now independent, tray rendering has a built-in fallback, and reveal tolerates blur/focus races.
- Packaged renderer startup resolving to `chrome-error://chromewebdata/` because `file://` module/CSS requests were rejected by CORS with `webSecurity` enabled; production assets now use a path-confined privileged `spotlight://renderer` origin and the exact signed Portable UI is visually verified.
- Settings expanding into an empty transparent window because the IPC sender policy still required `file:` after the renderer moved to `spotlight://`; the exact trusted origin is now accepted and Settings renders a visible loading/error state if data is unavailable.
- Missing packaged product and tray artwork; `resources/icon.ico` now contains seven transparent 32-bit Windows frames and `resources/icon.png` supplies the matching runtime tray source.
- Production focus loss hiding the entire search surface even though the user had not explicitly toggled or dismissed DeepDive.
