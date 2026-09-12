import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'

const requireModule = createRequire(__filename)
const { readPeImports, verifyRuntimeDirectory } = requireModule(
  '../scripts/verify-native-dependencies.cjs'
) as {
  readPeImports: (buffer: Buffer) => { machine: number; imports: string[] }
  verifyRuntimeDirectory: (
    runtimeDirectory: string,
    manifestPath: string
  ) => { checked: number; failures: string[] }
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

interface SyntheticPeOptions {
  /** DLL names for the regular import table. */
  imports?: string[]
  /** DLL names for the delay-load table. */
  delayImports?: string[]
  /** COFF machine value; defaults to x64. */
  machine?: number
  /** false builds a PE32 (32-bit) image instead of PE32+. */
  pe32Plus?: boolean
}

/**
 * Build a minimal synthetic PE image with one .rdata section containing
 * regular and delay-load import descriptors. The parser under test only
 * reads headers, descriptors, lookup tables, and DLL-name strings, so the
 * fixture stays small and fully deterministic with no provisioned binaries.
 */
function buildSyntheticPe(options: SyntheticPeOptions = {}): Buffer {
  const { imports = [], delayImports = [], machine = 0x8664, pe32Plus = true } = options
  const thunkSize = pe32Plus ? 8 : 4
  const optionalSize = pe32Plus ? 240 : 224
  const sectionFileOffset = 0x200
  const sectionRva = 0x1000

  // Deterministic layout: build section bytes with a bump allocator.
  const section = Buffer.alloc(0x800, 0)
  let offset = 0
  const alloc = (size: number): { rva: number; offset: number } => {
    const result = { rva: sectionRva + offset, offset }
    offset += size
    if (offset > section.length) throw new Error('Synthetic PE section overflow.')
    return result
  }
  const writeImportTable = (
    names: string[],
    entrySize: number,
    nameFieldOffset: number
  ): number => {
    if (names.length === 0) return 0
    const table = alloc(entrySize * (names.length + 1))
    names.forEach((name, index) => {
      const lookup = alloc(thunkSize * 2)
      const hintName = alloc(2 + Buffer.byteLength(name, 'ascii') + 1)
      const dllName = alloc(Buffer.byteLength(name, 'ascii') + 1)
      section.writeUInt16LE(0, hintName.offset)
      section.write(name, hintName.offset + 2, 'ascii')
      section.write(name, dllName.offset, 'ascii')
      const descriptor = table.offset + index * entrySize
      if (entrySize === 20) {
        section.writeUInt32LE(lookup.rva, descriptor)
        section.writeUInt32LE(dllName.rva, descriptor + nameFieldOffset)
        section.writeUInt32LE(lookup.rva, descriptor + 16)
      } else {
        section.writeUInt32LE(dllName.rva, descriptor + nameFieldOffset)
        section.writeUInt32LE(lookup.rva, descriptor + 16)
      }
      if (pe32Plus) section.writeBigUInt64LE(BigInt(hintName.rva), lookup.offset)
      else section.writeUInt32LE(hintName.rva, lookup.offset)
    })
    return table.rva
  }

  const importRva = writeImportTable(imports, 20, 12)
  const delayRva = writeImportTable(delayImports, 32, 4)

  const buffer = Buffer.alloc(sectionFileOffset + section.length, 0)
  buffer.writeUInt16LE(0x5a4d, 0)
  buffer.writeUInt32LE(0x40, 0x3c)
  buffer.writeUInt32LE(0x00004550, 0x40)
  buffer.writeUInt16LE(machine, 0x44)
  buffer.writeUInt16LE(1, 0x46) // one section
  buffer.writeUInt16LE(optionalSize, 0x54)
  const optionalOffset = 0x40 + 4 + 20
  buffer.writeUInt16LE(pe32Plus ? 0x20b : 0x10b, optionalOffset)
  const directoryOffset = optionalOffset + (pe32Plus ? 112 : 96)
  buffer.writeUInt32LE(importRva, directoryOffset + 8)
  buffer.writeUInt32LE(imports.length === 0 ? 0 : 0x40, directoryOffset + 12)
  buffer.writeUInt32LE(delayRva, directoryOffset + 13 * 8)
  buffer.writeUInt32LE(delayImports.length === 0 ? 0 : 0x40, directoryOffset + 13 * 8 + 4)
  const sectionHeader = optionalOffset + optionalSize
  buffer.write('.rdata', sectionHeader, 'ascii')
  buffer.writeUInt32LE(offset, sectionHeader + 8)
  buffer.writeUInt32LE(sectionRva, sectionHeader + 12)
  buffer.writeUInt32LE(section.length, sectionHeader + 16)
  buffer.writeUInt32LE(sectionFileOffset, sectionHeader + 20)
  section.copy(buffer, sectionFileOffset, 0, offset)
  return buffer
}

function writeManifest(directory: string, overrides: Record<string, unknown> = {}): string {
  const manifest = {
    schema: 1,
    strategy: 'app-local',
    redistributables: {
      'vcruntime140.dll': {
        version: '14.0.0',
        bytes: 4,
        sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
      }
    },
    windowsNative: ['kernel32.dll'],
    ...overrides
  }
  const manifestPath = join(directory, 'vc-runtime.json')
  writeFileSync(manifestPath, JSON.stringify(manifest))
  return manifestPath
}

describe('native dependency validation', () => {
  it('parses regular and delay-load imports from a synthetic x64 image', () => {
    const parsed = readPeImports(
      buildSyntheticPe({
        imports: ['KERNEL32.dll', 'vcruntime140.dll'],
        delayImports: ['delayed.dll']
      })
    )
    expect(parsed.machine).toBe(0x8664)
    expect(parsed.imports).toEqual(['kernel32.dll', 'vcruntime140.dll', 'delayed.dll'])
  })

  it('parses a synthetic 32-bit image and reports its machine type', () => {
    const parsed = readPeImports(buildSyntheticPe({ imports: ['kernel32.dll'], pe32Plus: false }))
    expect(parsed.machine).toBe(0x8664)
    expect(parsed.imports).toEqual(['kernel32.dll'])
  })

  it('rejects non-PE input', () => {
    expect(() => readPeImports(Buffer.from('not a binary'))).toThrow(/not a pe image/i)
  })

  it('passes when every import is bundled, Windows-native, or declared', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-native-deps-'))
    temporaryDirectories.push(root)
    const runtime = join(root, 'runtime')
    mkdirSync(runtime, { recursive: true })
    // Declared fixture must be a valid x64 PE whose hash matches the manifest.
    const declaredBytes = buildSyntheticPe({})
    const declaredHash = createHash('sha256').update(declaredBytes).digest('hex')
    // Imported fixture binary: kernel32 (native allowlist), api-ms forwarder,
    // bundled.dll (present), vcruntime140.dll (declared + present).
    writeFileSync(
      join(runtime, 'app.exe'),
      buildSyntheticPe({
        imports: [
          'KERNEL32.dll',
          'api-ms-win-crt-heap-l1-1-0.dll',
          'bundled.dll',
          'VCRUNTIME140.dll'
        ]
      })
    )
    writeFileSync(join(runtime, 'bundled.dll'), buildSyntheticPe({}))
    writeFileSync(join(runtime, 'vcruntime140.dll'), declaredBytes)
    const manifestPath = writeManifest(root, {
      redistributables: {
        'vcruntime140.dll': {
          version: '1.0',
          bytes: declaredBytes.length,
          sha256: declaredHash
        }
      }
    })

    const result = verifyRuntimeDirectory(runtime, manifestPath)
    expect(result.checked).toBe(3)
    expect(result.failures).toEqual([])
  })

  it('fails with an actionable line when a declared file is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-native-deps-'))
    temporaryDirectories.push(root)
    writeFileSync(join(root, 'app.exe'), buildSyntheticPe({ imports: ['vcruntime140.dll'] }))
    const manifestPath = writeManifest(root)

    const result = verifyRuntimeDirectory(root, manifestPath)
    expect(result.failures.length).toBeGreaterThan(0)
    expect(result.failures.join('\n')).toMatch(/app\.exe -> vcruntime140\.dll -> /)
  })

  it('fails with an actionable line for undeclared non-Windows imports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-native-deps-'))
    temporaryDirectories.push(root)
    // Present but unknown files count as bundled, so only truly missing
    // unknown imports fail.
    writeFileSync(join(root, 'app.exe'), buildSyntheticPe({ imports: ['somefuture.dll'] }))
    writeFileSync(join(root, 'somefuture.dll'), buildSyntheticPe({}))
    writeFileSync(join(root, 'needy.exe'), buildSyntheticPe({ imports: ['mystery140.dll'] }))
    const manifestPath = writeManifest(root, { redistributables: {} })

    const result = verifyRuntimeDirectory(root, manifestPath)
    expect(result.failures.join('\n')).toMatch(/needy\.exe -> mystery140\.dll -> neither bundled/)
    expect(result.failures.join('\n')).not.toMatch(/somefuture\.dll -> /)
  })

  it('fails when a declared file hash does not match the manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-native-deps-'))
    temporaryDirectories.push(root)
    writeFileSync(join(root, 'vcruntime140.dll'), buildSyntheticPe({ imports: ['kernel32.dll'] }))
    const manifestPath = writeManifest(root)

    const result = verifyRuntimeDirectory(root, manifestPath)
    expect(result.failures.join('\n')).toMatch(/vcruntime140\.dll -> hash mismatch/)
  })

  it('fails when a binary targets the wrong architecture', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-native-deps-'))
    temporaryDirectories.push(root)
    writeFileSync(join(root, 'app.exe'), buildSyntheticPe({ machine: 0x14c }))
    const manifestPath = writeManifest(root, { redistributables: {} })

    const result = verifyRuntimeDirectory(root, manifestPath)
    expect(result.failures.join('\n')).toMatch(/app\.exe -> non-x64 image/)
  })

  it('keeps the committed provenance manifest consistent', () => {
    const manifest = JSON.parse(readFileSync('resources/ai/vc-runtime.json', 'utf8')) as {
      strategy: string
      redistributables: Record<string, { version: string; bytes: number; sha256: string }>
      windowsNative: string[]
    }
    expect(manifest.strategy).toBe('app-local')
    expect(Object.keys(manifest.redistributables).sort()).toEqual([
      'msvcp140.dll',
      'vcruntime140.dll',
      'vcruntime140_1.dll'
    ])
    for (const entry of Object.values(manifest.redistributables)) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/i)
      expect(entry.bytes).toBeGreaterThan(0)
    }
    expect(manifest.windowsNative).toContain('kernel32.dll')
  })
})
