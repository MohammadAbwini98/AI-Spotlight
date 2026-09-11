import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { AI_CONFIG } from './ai-config'
import { AiError } from './ai-errors'

export interface LlamaServerHandle {
  baseUrl: string
  port: number
  pid: number | undefined
}

interface SpawnLlamaServerOptions {
  executablePath: string
  modelPath: string
  threads: number
  contextSize: number
  /** Override for tests. */
  healthTimeoutMs?: number
  healthPollIntervalMs?: number
  onExit?: (code: number | null, signal: string | null) => void
}

/**
 * Owns the llama-server child process. This is the only module allowed to use
 * `child_process.spawn`, always with `shell: false`, and always bound to the
 * loopback address — never to all network interfaces.
 */
export class LlamaProcessManager {
  private child: ChildProcess | null = null
  private handle: LlamaServerHandle | null = null
  private starting = false

  isRunning(): boolean {
    return this.child !== null && this.handle !== null
  }

  getHandle(): LlamaServerHandle | null {
    return this.handle
  }

  /** Starts llama-server idempotently; concurrent callers share one startup. */
  async start(options: SpawnLlamaServerOptions): Promise<LlamaServerHandle> {
    if (this.handle) return this.handle
    if (this.starting) throw new AiError('AI_BUSY', 'The AI runtime is already starting.')
    this.starting = true
    try {
      assertExecutable(options.executablePath)
      assertModelFile(options.modelPath)

      const port = await pickFreeLoopbackPort()
      const args = buildServerArgs({
        modelPath: options.modelPath,
        port,
        threads: options.threads,
        contextSize: options.contextSize
      })

      const child = spawn(options.executablePath, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child
      child.on('error', () => this.markExited())
      child.on('exit', (code, signal) => {
        this.markExited()
        options.onExit?.(code, signal)
      })
      // Drain output so a full pipe can never block the runtime.
      child.stdout?.on('data', () => undefined)
      child.stderr?.on('data', (chunk: Buffer) => {
        if (String(chunk).includes('out of memory')) {
          this.markExited()
          options.onExit?.(null, 'AI_OUT_OF_MEMORY')
        }
      })

      const baseUrl = `http://${AI_CONFIG.host}:${port}`
      await waitForHealth(
        baseUrl,
        options.healthTimeoutMs ?? AI_CONFIG.healthTimeoutMs,
        options.healthPollIntervalMs ?? AI_CONFIG.healthPollIntervalMs
      )

      this.handle = { baseUrl, port, pid: child.pid }
      return this.handle
    } catch (error) {
      await this.stop()
      if (error instanceof AiError) throw error
      throw new AiError(
        'AI_RUNTIME_START_FAILED',
        `Could not start the AI runtime: ${String(error)}`
      )
    } finally {
      this.starting = false
    }
  }

  /** Graceful shutdown with a bounded wait, then force-kill if required. */
  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.handle = null
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // Already exited.
        }
        resolve()
      }, 5000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      try {
        child.kill()
      } catch {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  private markExited(): void {
    this.child = null
    this.handle = null
  }
}

function assertExecutable(executablePath: string): void {
  if (!executablePath || executablePath.trim().length === 0) {
    throw new AiError('AI_RUNTIME_NOT_FOUND', 'AI runtime executable is not configured.')
  }
  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(executablePath)
  } catch {
    throw new AiError('AI_RUNTIME_NOT_FOUND', 'AI runtime executable was not found.')
  }
  if (!stats.isFile()) {
    throw new AiError('AI_RUNTIME_NOT_FOUND', 'AI runtime executable was not found.')
  }
}

function assertModelFile(modelPath: string): void {
  if (!modelPath || !existsSync(modelPath)) {
    throw new AiError('AI_MODEL_NOT_FOUND', 'Model file was not found.')
  }
}

/** CLI arguments for llama-server. Host is always loopback. */
export function buildServerArgs(args: {
  modelPath: string
  port: number
  threads: number
  contextSize: number
}): string[] {
  return [
    '--model',
    args.modelPath,
    '--host',
    AI_CONFIG.host,
    '--port',
    String(args.port),
    '--threads',
    String(args.threads),
    '--ctx-size',
    String(args.contextSize)
  ]
}

/** Finds a free loopback port so a fixed port collision can never break startup. */
export function pickFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer()
    server.on('error', reject)
    server.listen(0, AI_CONFIG.host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

/** Bounded health polling. No blind fixed sleeps. */
export async function waitForHealth(
  baseUrl: string,
  timeoutMs: number,
  pollIntervalMs: number
): Promise<void> {
  const started = Date.now()
  for (;;) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(`${baseUrl}/health`, { signal: controller.signal })
        if (response.ok) return
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Server not up yet; keep polling until the timeout.
    }
    if (Date.now() - started > timeoutMs) {
      throw new AiError('AI_RUNTIME_TIMEOUT', 'Timed out waiting for the AI runtime.')
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
}
