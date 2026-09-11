import { cpus, totalmem } from 'node:os'

/**
 * Centralized local-AI configuration. No magic numbers elsewhere.
 * Conservative defaults for Gemma 4 12B, CPU-only, 64 GB RAM target.
 */
export const AI_CONFIG = {
  /** Expected model manifest id. */
  modelId: 'gemma-4-12b-it-q4-k-m',
  /** Pinned minimum llama.cpp runtime build. */
  runtimeMinimumVersion: 'b5000',
  /** Local loopback binding. Never 0.0.0.0. */
  host: '127.0.0.1',
  /** Context window tokens. */
  contextSize: 8192,
  /** Max response tokens per generation. */
  maxOutputTokens: 1024,
  /** Sampling. */
  temperature: 0.7,
  topP: 0.9,
  repeatPenalty: 1.1,
  /** Startup/health bounds (ms). No blind sleeps; poll with timeout. */
  startTimeoutMs: 120_000,
  healthPollIntervalMs: 250,
  healthTimeoutMs: 90_000,
  /** Stream idle watchdog (ms). */
  streamIdleTimeoutMs: 120_000,
  /** Single concurrent generation on CPU-only inference. */
  maxConcurrentGenerations: 1,
  /** Managed model subdirectory under the app data directory. */
  modelsSubdirectory: 'models',
  /** Explicit model-path override environment variable. */
  modelPathEnvVar: 'SPOTLIGHT_TODO_MODEL_PATH',
  /** Runtime executable override (development only). */
  runtimePathEnvVar: 'SPOTLIGHT_TODO_LLAMA_SERVER'
} as const

/**
 * Bounded CPU thread count for inference. Reserves capacity for the Electron
 * renderer, file indexing, SQLite, and the OS instead of consuming every core.
 */
export function resolveAiThreadCount(cpuCount = cpus().length): number {
  if (!Number.isSafeInteger(cpuCount) || cpuCount <= 0) return 4
  if (cpuCount <= 4) return Math.max(1, cpuCount - 1)
  if (cpuCount <= 8) return cpuCount - 2
  return Math.min(16, cpuCount - 4)
}

/** True when the machine is below the manifest minimum RAM for the model. */
export function isLowMemoryHost(totalBytes = totalmem(), minimumRamGb = 24): boolean {
  return totalBytes < minimumRamGb * 1024 * 1024 * 1024
}
