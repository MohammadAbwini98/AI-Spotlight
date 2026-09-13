/**
 * Model share-package tests: split a GGUF file independently from the
 * application, prove bit-exact model reassembly, and prove fail-safe
 * rejection of damaged model packages.
 *
 * PowerShell-driven cases run on Windows only (release tooling target); the
 * release-integrity model verifier and gitignore checks run everywhere.
 */
import { randomBytes, createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const requireModule = createRequire(__filename)
const { verifySharePackage } = requireModule('../scripts/release-integrity.cjs') as {
  verifySharePackage: (
    shareDirectory: string,
    originalFilePath?: string | null
  ) => { packageType: string; fileName: string; partCount: number; originalSize: number }
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function runPowerShell(scriptArgs: string[], cwd: string): { exitCode: number; output: string } {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...scriptArgs],
    {
      cwd,
      encoding: 'utf8',
      timeout: 300000,
      windowsHide: true
    }
  )
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  }
}

function writeFakeGguf(path: string, size: number): void {
  writeFileSync(path, Buffer.concat([Buffer.from('GGUF'), randomBytes(Math.max(0, size - 4))]))
}

async function makeWorkDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'spotlight-share-model-'))
  temporaryDirectories.push(root)
  return root
}

interface ModelManifest {
  formatVersion: number
  packageType: string
  application: string
  modelFile: string
  modelFamily?: string
  modelSize?: string
  quantization?: string
  recommendedApplicationVersion?: string
  originalSize: number
  originalSha256: string
  chunkSizeBytes: number
  partCount: number
  parts: Array<{ name: string; size: number; sha256: string }>
}

function readModelManifest(packageDirectory: string): ModelManifest {
  return JSON.parse(readFileSync(join(packageDirectory, 'manifest.json'), 'utf8')) as ModelManifest
}

function splitModel(
  modelFile: string,
  chunkSizeBytes: number,
  outputDirectory: string,
  extraArgs: string[] = []
): string {
  const result = runPowerShell(
    [
      '-File',
      join('scripts', 'split-model.ps1'),
      '-ModelPath',
      modelFile,
      '-ChunkSizeBytes',
      String(chunkSizeBytes),
      '-OutputDirectory',
      outputDirectory,
      '-MinimumFileBytes',
      '1',
      ...extraArgs
    ],
    process.cwd()
  )
  if (result.exitCode !== 0) throw new Error(`split-model.ps1 failed:\n${result.output}`)
  const packageDirectory = join(outputDirectory, 'test-model-Q4_K_M')
  expect(existsSync(packageDirectory)).toBe(true)
  return packageDirectory
}

function reassembleModel(
  packageDirectory: string,
  extraArgs: string[] = []
): { exitCode: number; output: string } {
  return runPowerShell(
    ['-File', join(packageDirectory, 'Reassemble-Model.ps1'), ...extraArgs],
    packageDirectory
  )
}

describe('model share-package integrity verifier (release-integrity.cjs)', () => {
  it('accepts an ai-model package and rejects tampering', async () => {
    const root = await makeWorkDirectory()
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(root, 'parts'), { recursive: true })
    const chunk = Buffer.from('modelchunk')
    const payloads = [chunk, chunk, Buffer.from('tail!')]
    const manifest = {
      formatVersion: 1,
      packageType: 'ai-model',
      application: 'AI Spotlight',
      modelFile: 'model.gguf',
      originalSize: chunk.length * 2 + 5,
      originalSha256: createHash('sha256').update(Buffer.concat(payloads)).digest('hex'),
      chunkSizeBytes: chunk.length,
      partCount: 3,
      parts: payloads.map((payload, index) => ({
        name: `model.gguf.part00${index + 1}`,
        size: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex')
      }))
    }
    payloads.forEach((payload, index) => {
      writeFileSync(join(root, 'parts', `model.gguf.part00${index + 1}`), payload)
    })
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest))

    const summary = verifySharePackage(root)
    expect(summary).toMatchObject({ packageType: 'ai-model', fileName: 'model.gguf', partCount: 3 })

    const corrupted = Buffer.from(chunk)
    corrupted[0] ^= 0xff
    writeFileSync(join(root, 'parts', 'model.gguf.part002'), corrupted)
    expect(() => verifySharePackage(root)).toThrow(/hash mismatch/)
  })

  it('rejects duplicate names, unexpected files, and bad package types', async () => {
    const root = await makeWorkDirectory()
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(root, 'parts'), { recursive: true })
    const payload = Buffer.from('payload!')
    writeFileSync(join(root, 'parts', 'model.gguf.part001'), payload)
    const manifest = {
      formatVersion: 1,
      packageType: 'ai-model',
      application: 'AI Spotlight',
      modelFile: 'model.gguf',
      originalSize: payload.length,
      originalSha256: createHash('sha256').update(payload).digest('hex'),
      chunkSizeBytes: payload.length,
      partCount: 1,
      parts: [
        {
          name: 'model.gguf.part001',
          size: payload.length,
          sha256: sha256Of(join(root, 'parts', 'model.gguf.part001'))
        }
      ]
    }
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest))
    expect(verifySharePackage(root).packageType).toBe('ai-model')

    writeFileSync(join(root, 'parts', 'model.gguf.part999'), payload)
    expect(() => verifySharePackage(root)).toThrow(/part set mismatch/)

    await rm(join(root, 'parts', 'model.gguf.part999'))
    writeFileSync(
      join(root, 'manifest.json'),
      JSON.stringify({ ...manifest, packageType: 'firmware' })
    )
    expect(() => verifySharePackage(root)).toThrow(/packageType/)
  })

  it('keeps model artifacts out of version control', () => {
    const gitignore = readFileSync('.gitignore', 'utf8')
    expect(gitignore).toMatch(/^\*\.gguf$/m)
    expect(gitignore).toMatch(/^release$/m)
  })

  it('exposes model and offline share commands', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['release:split:model']).toContain('split-model.ps1')
    expect(packageJson.scripts['release:share:offline']).toContain('Create-SharePackage.ps1')
    expect(existsSync('scripts/split-model.ps1')).toBe(true)
    expect(existsSync('scripts/share/Reassemble-Model.template.ps1')).toBe(true)
  })
})

const powershellCases = process.platform === 'win32' ? describe : describe.skip

powershellCases('model split and reassembly (PowerShell)', () => {
  const chunkSize = 65536

  it('reconstructs a simulated model bit-exact with a model manifest', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize * 3 + 12345)
    // Explicit spaced metadata exercises Start-Process argument quoting:
    // an unquoted value would split and corrupt parameter binding.
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'), [
      '-ModelFamily',
      'Gemma 4',
      '-ModelSizeLabel',
      '12B'
    ])

    const manifest = readModelManifest(packageDirectory)
    expect(manifest.formatVersion).toBe(1)
    expect(manifest.packageType).toBe('ai-model')
    expect(manifest.application).toBe('AI Spotlight')
    expect(manifest.modelFile).toBe('test-model-Q4_K_M.gguf')
    expect(manifest.modelFamily).toBe('Gemma 4')
    expect(manifest.modelSize).toBe('12B')
    expect(manifest.originalSize).toBe(chunkSize * 3 + 12345)
    expect(manifest.originalSha256).toBe(sha256Of(modelFile))
    expect(manifest.chunkSizeBytes).toBe(chunkSize)
    expect(manifest.partCount).toBe(4)
    expect(manifest.parts[0].size).toBe(chunkSize)
    // No invented provenance: only locally known fields are present.
    const raw = JSON.parse(readFileSync(join(packageDirectory, 'manifest.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(raw).not.toHaveProperty('originalFile')
    expect(raw).not.toHaveProperty('version')
    expect(raw).not.toHaveProperty('sourceUrl')
    expect(raw).not.toHaveProperty('license')
    expect(raw).not.toHaveProperty('upstreamRevision')
    manifest.parts.forEach((part, index) => {
      expect(part.name).toBe(`test-model-Q4_K_M.gguf.part00${index + 1}`)
      expect(sha256Of(join(packageDirectory, 'parts', part.name))).toBe(part.sha256)
    })
    expect(existsSync(join(packageDirectory, 'Reassemble-Model.ps1'))).toBe(true)
    const readme = readFileSync(join(packageDirectory, 'README.txt'), 'utf8')
    expect(readme).toContain('Reassemble-Model.ps1')
    expect(readme).toContain('MODEL SHA-256: VERIFIED')

    const reassembled = reassembleModel(packageDirectory)
    expect(reassembled.exitCode).toBe(0)
    expect(reassembled.output).toContain('Part 4 / 4')
    expect(reassembled.output).toContain('MODEL SHA-256: VERIFIED')
    expect(reassembled.output).toContain('identical to the distributed GGUF')
    expect(sha256Of(join(packageDirectory, 'test-model-Q4_K_M.gguf'))).toBe(sha256Of(modelFile))
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf.partial'))).toBe(false)
  })

  it('derives metadata from the application manifest on filename match', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'gemma-4-12b-it-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize + 7)
    const result = runPowerShell(
      [
        '-File',
        join('scripts', 'split-model.ps1'),
        '-ModelPath',
        modelFile,
        '-ChunkSizeBytes',
        String(chunkSize),
        '-OutputDirectory',
        join(root, 'share'),
        '-MinimumFileBytes',
        '1'
      ],
      process.cwd()
    )
    expect(result.exitCode).toBe(0)
    const manifest = readModelManifest(join(root, 'share', 'gemma-4-12b-it-Q4_K_M'))
    expect(manifest.modelFamily).toBe('gemma')
    expect(manifest.quantization).toBe('Q4_K_M')
    expect(manifest.recommendedApplicationVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('rejects clearly invalid model inputs before splitting', async () => {
    const root = await makeWorkDirectory()
    const notModel = join(root, 'notes.txt')
    writeFileSync(notModel, randomBytes(1024))
    const wrongExtension = runPowerShell(
      [
        '-File',
        join('scripts', 'split-model.ps1'),
        '-ModelPath',
        notModel,
        '-MinimumFileBytes',
        '1'
      ],
      process.cwd()
    )
    expect(wrongExtension.exitCode).not.toBe(0)
    expect(wrongExtension.output).toMatch(/not a valid supported GGUF model/)

    const noMagic = join(root, 'fake.gguf')
    writeFileSync(noMagic, randomBytes(1024))
    const badMagic = runPowerShell(
      [
        '-File',
        join('scripts', 'split-model.ps1'),
        '-ModelPath',
        noMagic,
        '-MinimumFileBytes',
        '1'
      ],
      process.cwd()
    )
    expect(badMagic.exitCode).not.toBe(0)
    expect(badMagic.output).toMatch(/not a valid supported GGUF model/)

    const tiny = join(root, 'tiny.gguf')
    writeFakeGguf(tiny, 512)
    const tooSmall = runPowerShell(
      ['-File', join('scripts', 'split-model.ps1'), '-ModelPath', tiny],
      process.cwd()
    )
    expect(tooSmall.exitCode).not.toBe(0)
    expect(tooSmall.output).toMatch(/below.*minimum|not a valid supported GGUF model/)
  })

  it('fails on a missing model part', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize * 2 + 100)
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'))
    const manifest = readModelManifest(packageDirectory)
    await rm(join(packageDirectory, 'parts', manifest.parts[1].name))

    const reassembled = reassembleModel(packageDirectory)
    expect(reassembled.exitCode).not.toBe(0)
    expect(reassembled.output).toMatch(/Missing part/)
    expect(reassembled.output).toContain(manifest.parts[1].name)
    expect(reassembled.output).not.toContain('MODEL SHA-256: VERIFIED')
  })

  it('fails on a corrupt model part and leaves no output behind', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize * 2 + 100)
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'))
    const manifest = readModelManifest(packageDirectory)
    const victim = join(packageDirectory, 'parts', manifest.parts[0].name)
    const bytes = readFileSync(victim)
    bytes[Math.floor(bytes.length / 2)] ^= 0xff
    writeFileSync(victim, bytes)

    const reassembled = reassembleModel(packageDirectory)
    expect(reassembled.exitCode).not.toBe(0)
    expect(reassembled.output).toMatch(/SHA-256 mismatch/)
    expect(reassembled.output).toContain('NOT been accepted')
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf'))).toBe(false)
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf.partial'))).toBe(false)
  })

  it('fails on part-hash, part-size, and original-hash tampering', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize + 10)
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'))
    const manifestPath = join(packageDirectory, 'manifest.json')
    const pristine = JSON.parse(JSON.stringify(readModelManifest(packageDirectory)))

    const withPartHash = JSON.parse(JSON.stringify(pristine))
    withPartHash.parts[0].sha256 = '1'.repeat(64)
    writeFileSync(manifestPath, JSON.stringify(withPartHash))
    expect(reassembleModel(packageDirectory).output).toMatch(/SHA-256 mismatch/)

    const withPartSize = JSON.parse(JSON.stringify(pristine))
    withPartSize.parts[0].size += 1
    writeFileSync(manifestPath, JSON.stringify(withPartSize))
    expect(reassembleModel(packageDirectory).output).toMatch(
      /incorrect part size|sum of part sizes/
    )

    const withOriginalHash = JSON.parse(JSON.stringify(pristine))
    withOriginalHash.originalSha256 = '2'.repeat(64)
    writeFileSync(manifestPath, JSON.stringify(withOriginalHash))
    const tampered = reassembleModel(packageDirectory)
    expect(tampered.exitCode).not.toBe(0)
    expect(tampered.output).toMatch(/SHA-256 mismatch/)
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf'))).toBe(false)
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf.partial'))).toBe(false)
  })

  it('rejects unexpected extra part files', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize + 10)
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'))
    writeFileSync(
      join(packageDirectory, 'parts', 'test-model-Q4_K_M.gguf.part999'),
      randomBytes(16)
    )

    const reassembled = reassembleModel(packageDirectory)
    expect(reassembled.exitCode).not.toBe(0)
    expect(reassembled.output).toMatch(/unexpected filenames/)
  })

  it('refuses to overwrite an existing GGUF without explicit force', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize + 10)
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'))
    expect(reassembleModel(packageDirectory).exitCode).toBe(0)
    const second = reassembleModel(packageDirectory)
    expect(second.exitCode).not.toBe(0)
    expect(second.output).toMatch(/already exists/)
    const forced = reassembleModel(packageDirectory, ['-Force'])
    expect(forced.exitCode).toBe(0)
    expect(forced.output).toContain('MODEL SHA-256: VERIFIED')
  })

  it('fails fast when destination disk space is insufficient', async () => {
    const root = await makeWorkDirectory()
    const modelFile = join(root, 'test-model-Q4_K_M.gguf')
    writeFakeGguf(modelFile, chunkSize + 10)
    const packageDirectory = splitModel(modelFile, chunkSize, join(root, 'share'))
    const manifestPath = join(packageDirectory, 'manifest.json')
    const manifest = readModelManifest(packageDirectory)
    manifest.originalSize = 8 * 1024 ** 5
    writeFileSync(manifestPath, JSON.stringify(manifest))

    const reassembled = reassembleModel(packageDirectory)
    expect(reassembled.exitCode).not.toBe(0)
    expect(reassembled.output).toMatch(/Insufficient free disk space/)
    expect(reassembled.output).toMatch(/was not started/)
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf'))).toBe(false)
    expect(existsSync(join(packageDirectory, 'test-model-Q4_K_M.gguf.partial'))).toBe(false)
  })
})
