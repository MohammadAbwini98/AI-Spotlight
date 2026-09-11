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
