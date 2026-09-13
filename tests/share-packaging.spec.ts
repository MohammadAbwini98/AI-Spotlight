/**
 * Share-package tests: split a binary artifact into numbered parts and prove
 * bit-exact reassembly plus fail-safe rejection of damaged packages.
 *
 * PowerShell-driven split/reassemble cases run on Windows only (release
 * tooling target); the release-integrity share verifier is dependency-free
 * Node and is tested on every platform.
 */
import { randomBytes, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  ) => { partCount: number; originalSize: number; chunkSizeBytes: number }
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

function splitFixture(inputFile: string, chunkSizeBytes: number, outputDirectory: string): string {
  const result = runPowerShell(
    [
      '-File',
      join('scripts', 'split-release.ps1'),
      '-InputFile',
      inputFile,
      '-ChunkSizeBytes',
      String(chunkSizeBytes),
      '-OutputDirectory',
      outputDirectory
    ],
    process.cwd()
  )
  if (result.exitCode !== 0) throw new Error(`split-release.ps1 failed:\n${result.output}`)
  const packageDirectory = join(outputDirectory, 'fixture-1.0.2-Portable')
  expect(existsSync(packageDirectory)).toBe(true)
  return packageDirectory
}

function writeRandomBinary(path: string, size: number): void {
  writeFileSync(path, randomBytes(size))
}

async function makeWorkDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'spotlight-share-'))
  temporaryDirectories.push(root)
  return root
}

interface ShareManifest {
  formatVersion: number
  application: string
  version: string
  originalFile: string
  originalSize: number
  originalSha256: string
  chunkSizeBytes: number
  partCount: number
  parts: Array<{ name: string; size: number; sha256: string }>
}

function readManifest(packageDirectory: string): ShareManifest {
  return JSON.parse(readFileSync(join(packageDirectory, 'manifest.json'), 'utf8')) as ShareManifest
}

describe('share-package integrity verifier (release-integrity.cjs)', () => {
  it('accepts a well-formed package and rejects tampering', async () => {
    const root = await makeWorkDirectory()
    const partsDirectory = join(root, 'parts')
    mkdirSync(partsDirectory, { recursive: true })
    const chunk = Buffer.from('chunk-a-')
    const manifest: ShareManifest = {
      formatVersion: 1,
      application: 'AI Spotlight',
      version: '1.0.2',
      originalFile: 'app.exe',
      originalSize: chunk.length * 2 + 3,
      originalSha256: createHash('sha256')
        .update(Buffer.concat([chunk, chunk, Buffer.from('end')]))
        .digest('hex'),
      chunkSizeBytes: chunk.length,
      partCount: 3,
      parts: []
    }
    const payloads = [chunk, chunk, Buffer.from('end')]
    payloads.forEach((payload, index) => {
      const name = `app.exe.part00${index + 1}`
      writeFileSync(join(partsDirectory, name), payload)
      manifest.parts.push({
        name,
        size: payload.length,
        sha256: createHash('sha256').update(payload).digest('hex')
      })
    })
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest))

    const summary = verifySharePackage(root)
    expect(summary).toMatchObject({ partCount: 3, originalSize: chunk.length * 2 + 3 })

    // Corrupt part on disk (same length, flipped byte).
    const corrupted = Buffer.from(chunk)
    corrupted[0] ^= 0xff
    writeFileSync(join(partsDirectory, 'app.exe.part002'), corrupted)
    expect(() => verifySharePackage(root)).toThrow(/hash mismatch/)

    // Restore, then remove a part.
    writeFileSync(join(partsDirectory, 'app.exe.part002'), chunk)
    await rm(join(partsDirectory, 'app.exe.part003'))
    expect(() => verifySharePackage(root)).toThrow(/part set mismatch/)
  })

  it('rejects invalid manifests and original-artifact mismatches', async () => {
    const root = await makeWorkDirectory()
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ formatVersion: 999 }))
    expect(() => verifySharePackage(root, null)).toThrow(/formatVersion/)

    const partsDirectory = join(root, 'parts')
    mkdirSync(partsDirectory, { recursive: true })
    const payload = Buffer.from('payload')
    writeFileSync(join(partsDirectory, 'app.exe.part001'), payload)
    const manifest: ShareManifest = {
      formatVersion: 1,
      application: 'AI Spotlight',
      version: '1.0.2',
      originalFile: 'app.exe',
      originalSize: payload.length,
      originalSha256: createHash('sha256').update(payload).digest('hex'),
      chunkSizeBytes: payload.length,
      partCount: 1,
      parts: [
        {
          name: 'app.exe.part001',
          size: payload.length,
          sha256: createHash('sha256').update(payload).digest('hex')
        }
      ]
    }
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest))
    const original = join(root, 'app.exe')
    writeFileSync(original, payload)
    expect(verifySharePackage(root, original).partCount).toBe(1)
    writeFileSync(original, Buffer.from('PAYLOAD'))
    expect(() => verifySharePackage(root, original)).toThrow(/SHA-256/)
  })
})

const powershellCases = process.platform === 'win32' ? describe : describe.skip

powershellCases('split and reassemble (PowerShell)', () => {
  const chunkSize = 65536
  const sizes: Array<[string, number]> = [
    ['smaller than one chunk', 32768],
    ['exactly one chunk', chunkSize],
    ['chunk plus one byte', chunkSize + 1],
    ['several chunks with uneven final part', chunkSize * 3 + 12345]
  ]

  for (const [label, size] of sizes) {
    it(`reconstructs bit-exact output when ${label}`, async () => {
      const root = await makeWorkDirectory()
      const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
      writeRandomBinary(inputFile, size)
      const packageDirectory = splitFixture(inputFile, chunkSize, join(root, 'share'))

      const manifest = readManifest(packageDirectory)
      expect(manifest.formatVersion).toBe(1)
      expect(manifest.application).toBe('AI Spotlight')
      expect(manifest.version).toBe('1.0.2')
      expect(manifest.originalFile).toBe('fixture-1.0.2-Portable.exe')
      expect(manifest.originalSize).toBe(size)
      expect(manifest.originalSha256).toBe(sha256Of(inputFile))
      expect(manifest.chunkSizeBytes).toBe(chunkSize)
      expect(manifest.partCount).toBe(Math.ceil(size / chunkSize))
      const expectedWidth = Math.max(3, String(manifest.partCount).length)
      manifest.parts.forEach((part, index) => {
        const expectedName = `fixture-1.0.2-Portable.exe.part${String(index + 1).padStart(expectedWidth, '0')}`
        expect(part.name).toBe(expectedName)
        expect(part.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(sha256Of(join(packageDirectory, 'parts', part.name))).toBe(part.sha256)
      })
      const partSizes = manifest.parts.reduce((sum, part) => sum + part.size, 0)
      expect(partSizes).toBe(size)
      expect(existsSync(join(packageDirectory, 'Reassemble.ps1'))).toBe(true)
      expect(existsSync(join(packageDirectory, 'README.txt'))).toBe(true)

      const reassemble = runPowerShell(
        ['-File', join(packageDirectory, 'Reassemble.ps1')],
        packageDirectory
      )
      expect(reassemble.exitCode).toBe(0)
      expect(reassemble.output).toContain('AI Spotlight package reconstructed successfully.')
      expect(reassemble.output).toContain(`${manifest.partCount} / ${manifest.partCount} verified`)
      expect(reassemble.output).toContain('SHA-256:')
      expect(reassemble.output).toContain('MATCH')
      expect(reassemble.output).toContain('identical to the signed release artifact')
      expect(sha256Of(join(packageDirectory, manifest.originalFile))).toBe(sha256Of(inputFile))
    })
  }

  it('fails on a missing part without reporting success', async () => {
    const root = await makeWorkDirectory()
    const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
    writeRandomBinary(inputFile, chunkSize * 2 + 100)
    const packageDirectory = splitFixture(inputFile, chunkSize, join(root, 'share'))
    const manifest = readManifest(packageDirectory)
    await rm(join(packageDirectory, 'parts', manifest.parts[1].name))

    const reassemble = runPowerShell(
      ['-File', join(packageDirectory, 'Reassemble.ps1')],
      packageDirectory
    )
    expect(reassemble.exitCode).not.toBe(0)
    expect(reassemble.output).toMatch(/Missing part/)
    expect(reassemble.output).toContain(manifest.parts[1].name)
    expect(reassemble.output).not.toContain('reconstructed successfully')
  })

  it('fails SHA verification on a corrupt part and accepts nothing', async () => {
    const root = await makeWorkDirectory()
    const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
    writeRandomBinary(inputFile, chunkSize * 2 + 100)
    const packageDirectory = splitFixture(inputFile, chunkSize, join(root, 'share'))
    const manifest = readManifest(packageDirectory)
    const victim = join(packageDirectory, 'parts', manifest.parts[0].name)
    const bytes = readFileSync(victim)
    bytes[Math.floor(bytes.length / 2)] ^= 0xff
    writeFileSync(victim, bytes)

    const reassemble = runPowerShell(
      ['-File', join(packageDirectory, 'Reassemble.ps1')],
      packageDirectory
    )
    expect(reassemble.exitCode).not.toBe(0)
    expect(reassemble.output).toMatch(/SHA-256 mismatch/)
    expect(reassemble.output).toContain('NOT been accepted')
    expect(existsSync(join(packageDirectory, manifest.originalFile))).toBe(false)
  })

  it('fails when the manifest hash was modified', async () => {
    const root = await makeWorkDirectory()
    const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
    writeRandomBinary(inputFile, chunkSize + 10)
    const packageDirectory = splitFixture(inputFile, chunkSize, join(root, 'share'))
    const manifestPath = join(packageDirectory, 'manifest.json')
    const manifest = readManifest(packageDirectory)
    manifest.originalSha256 = '0'.repeat(64)
    writeFileSync(manifestPath, JSON.stringify(manifest))

    const reassemble = runPowerShell(
      ['-File', join(packageDirectory, 'Reassemble.ps1')],
      packageDirectory
    )
    expect(reassemble.exitCode).not.toBe(0)
    expect(reassemble.output).toMatch(/SHA-256 mismatch/)
    expect(reassemble.output).not.toContain('reconstructed successfully')
  })

  it('refuses to overwrite an existing destination', async () => {
    const root = await makeWorkDirectory()
    const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
    writeRandomBinary(inputFile, chunkSize + 10)
    const packageDirectory = splitFixture(inputFile, chunkSize, join(root, 'share'))
    const first = runPowerShell(
      ['-File', join(packageDirectory, 'Reassemble.ps1')],
      packageDirectory
    )
    expect(first.exitCode).toBe(0)
    const second = runPowerShell(
      ['-File', join(packageDirectory, 'Reassemble.ps1')],
      packageDirectory
    )
    expect(second.exitCode).not.toBe(0)
    expect(second.output).toMatch(/already exists/)
  })

  it('protects existing split output unless forced', async () => {
    const root = await makeWorkDirectory()
    const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
    writeRandomBinary(inputFile, chunkSize + 10)
    const outputDirectory = join(root, 'share')
    splitFixture(inputFile, chunkSize, outputDirectory)
    const again = runPowerShell(
      [
        '-File',
        join('scripts', 'split-release.ps1'),
        '-InputFile',
        inputFile,
        '-ChunkSizeBytes',
        String(chunkSize),
        '-OutputDirectory',
        outputDirectory
      ],
      process.cwd()
    )
    expect(again.exitCode).not.toBe(0)
    expect(again.output).toMatch(/already exists/)
    const forced = runPowerShell(
      [
        '-File',
        join('scripts', 'split-release.ps1'),
        '-InputFile',
        inputFile,
        '-ChunkSizeBytes',
        String(chunkSize),
        '-OutputDirectory',
        outputDirectory,
        '-Force'
      ],
      process.cwd()
    )
    expect(forced.exitCode).toBe(0)
  })

  it('uses four-digit padding once the part count exceeds 999', async () => {
    const root = await makeWorkDirectory()
    const inputFile = join(root, 'fixture-1.0.2-Portable.exe')
    writeRandomBinary(inputFile, 1005 * 1024 + 7)
    const packageDirectory = splitFixture(inputFile, 1024, join(root, 'share'))
    const manifest = readManifest(packageDirectory)
    expect(manifest.partCount).toBe(1006)
    expect(manifest.parts[0].name).toBe('fixture-1.0.2-Portable.exe.part0001')
    expect(manifest.parts[manifest.parts.length - 1].name).toBe(
      'fixture-1.0.2-Portable.exe.part1006'
    )
    const reassemble = runPowerShell(
      ['-File', join(packageDirectory, 'Reassemble.ps1')],
      packageDirectory
    )
    expect(reassemble.exitCode).toBe(0)
    expect(sha256Of(join(packageDirectory, manifest.originalFile))).toBe(sha256Of(inputFile))
  }, 300000)
})
