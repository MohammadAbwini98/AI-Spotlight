# AI runtime resources

This directory ships as packaged `resources/ai/` (via `extraResources`, outside
`app.asar` so the runtime can execute).

## Expected layout

```text
resources/ai/
  model-manifest.json      # model descriptor (versioned with the app)
  runtime/
    llama-server.exe       # llama.cpp server build (pinned minimum: b5000)
    *.dll                  # required llama.cpp runtime libraries
    LICENSE / NOTICE files for the runtime
```

## Model file (NOT bundled)

The multi-GB `gemma-4-12b-it-Q4_K_M.gguf` file is never placed here and never
inside the installer. At runtime the app resolves it from:

1. `%SPOTLIGHT_TODO_MODEL_PATH%` (explicit override), else
2. `%LOCALAPPDATA%\SpotlightTodo\models\<manifest filename>` (managed dir,
   populated once via AI Chat → Select model file…), else
3. missing-model UX.

Application upgrades replace the runtime + manifest but leave the managed
model directory untouched.

## Visual C++ runtime (app-local, no prerequisite installer)

The llama.cpp binaries above depend on the Microsoft Visual C++ runtime.
The exact dependency set was established by a full PE import-graph audit
(`dumpbin /DEPENDENTS` over all 50 runtime binaries plus delay-load
inspection, 2026-09-12): the complete union of non-Windows imports is
exactly `vcruntime140.dll`, `vcruntime140_1.dll`, and `msvcp140.dll`.
No `msvcp140_1/2`, `concrt140`, `vcomp140`, direct `ucrtbase`, or delay-load
imports exist. The remaining imports are bundled llama/ggml/mtmd/libomp
DLLs, `api-ms-win-crt-*` forwarders (Windows 10+ inbox UCRT), and core OS
DLLs (`kernel32`, `advapi32`, `ws2_32`, `crypt32`, `shell32`, `psapi`).

| Binary | Imported VC++ dependency | Windows-native | Bundled | External prerequisite |
| ------ | ------------------------ | -------------- | ------- | --------------------- |
| `llama-server.exe` + all thin `llama-*.exe` stubs | `vcruntime140.dll` | no | yes (`runtime/`) | none (app-local) |
| `llama.dll`, `llama-common.dll`, `llama-server-impl.dll` | `vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll` | no | yes (`runtime/`) | none (app-local) |
| `ggml*.dll`, `mtmd.dll`, `llama-*-impl.dll`, `llama-*.exe` tools | `vcruntime140.dll`, `msvcp140.dll` | no | yes (`runtime/`) | none (app-local) |
| `libomp.dll` (LLVM OpenMP) | none (`kernel32`/`psapi` only) | n/a | yes (`runtime/`) | none |
| `api-ms-win-crt-*.dll` forwarders | none (resolved by the OS inbox UCRT) | yes | n/a | none |

Provenance and qualification are pinned in `vc-runtime.json` (version,
bytes, SHA-256). Provisioning rules:

1. Copy ONLY the declared DLLs from the sanctioned payload
   `VC\Redist\MSVC\<version>\x64\Microsoft.VC145.CRT` of a Visual Studio /
   BuildTools installation (licensed Distributable Code). The qualified set
   is v14.51.36247.0; the full download reference is
   `https://aka.ms/vs/17/release/vc_redist.x64.exe`.
2. NEVER copy them from `C:\Windows\System32`.
3. Place them next to `llama-server.exe` in this directory so normal Windows
   DLL resolution finds them first; both Portable and per-user Setup packages
   ship this directory verbatim via `extraResources`.
4. Run `node scripts/verify-native-dependencies.cjs resources/ai/runtime`
   afterwards. The release pipeline runs the same gate pre-packaging
   (`package-release.cjs`) and against the packaged payload
   (`verify-release-security.ps1`); either failure blocks the release.

When the VC++ payload is serviced, re-copy from the sanctioned source,
rerun the gate, and update `version`/`bytes`/`sha256` in `vc-runtime.json`.
The app-local copy is serviced by shipping an updated app release; loader
resolution is directory-scoped to the llama-server process, so it never
downgrades or replaces the machine runtime.
