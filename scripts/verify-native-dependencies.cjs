// Validates that every native binary in the AI runtime directory has all of
// its non-Windows DLL dependencies either bundled alongside it or explicitly
// declared in resources/ai/vc-runtime.json (sanctioned app-local strategy).
//
// Usage: node scripts/verify-native-dependencies.cjs [--manifest <path>] <runtime-dir>
//
// Exit codes: 0 = all dependencies resolved, 1 = unresolved dependency,
// 2 = CLI usage error. Failures print actionable lines in the form:
//   binary -> missing dependency -> expected resolution strategy
//
// The PE import-table parser is dependency-free (Node builtins only) so the
// gate runs in any release environment without extra packages.
const { createHash } = require('crypto')
const { existsSync, readdirSync, readFileSync, statSync } = require('fs')
const { basename, join, resolve } = require('path')

const IMAGE_FILE_MACHINE_AMD64 = 0x8664
const OPTIONAL_MAGIC_PE32 = 0x10b
const OPTIONAL_MAGIC_PE32_PLUS = 0x20b

function readCString(buffer, offset, limit = 256) {
  let end = offset
  while (end < buffer.length && end - offset < limit && buffer[end] !== 0) end += 1
  if (end >= buffer.length || buffer[end] !== 0) {
    throw new Error('Unterminated string in PE import table.')
  }
  return buffer.toString('ascii', offset, end)
}

/**
 * Map a relative virtual address to a file offset using the section table.
 * @returns {number} file offset, or -1 when the RVA is not covered.
 */
function rvaToOffset(rva, sections) {
  for (const section of sections) {
    const size = Math.max(section.virtualSize, section.rawSize)
    if (rva >= section.virtualAddress && rva < section.virtualAddress + size) {
      return section.rawPointer + (rva - section.virtualAddress)
    }
  }
  return -1
}

function readImportDescriptors(buffer, rvaToFile, tableRva, is64Bit, entrySize, nameOffset) {
  const names = []
  if (tableRva === 0) return names
  let cursor = rvaToFile(tableRva)
  if (cursor < 0) throw new Error('Import table RVA is outside any section.')
  for (;;) {
    if (cursor + entrySize > buffer.length) throw new Error('Import table is truncated.')
    const nameRva = buffer.readUInt32LE(cursor + nameOffset)
    const lookupRva =
      entrySize === 20
        ? buffer.readUInt32LE(cursor) !== 0
          ? buffer.readUInt32LE(cursor)
          : buffer.readUInt32LE(cursor + 16)
        : buffer.readUInt32LE(cursor + 16)
    const terminator =
      entrySize === 20
        ? buffer.readUInt32LE(cursor) === 0 &&
          buffer.readUInt32LE(cursor + 4) === 0 &&
          buffer.readUInt32LE(cursor + 8) === 0 &&
          nameRva === 0 &&
          buffer.readUInt32LE(cursor + 16) === 0
        : buffer.readUInt32LE(cursor) === 0 &&
          nameRva === 0 &&
          buffer.readUInt32LE(cursor + 8) === 0 &&
          buffer.readUInt32LE(cursor + 12) === 0 &&
          buffer.readUInt32LE(cursor + 16) === 0 &&
          buffer.readUInt32LE(cursor + 20) === 0 &&
          buffer.readUInt32LE(cursor + 24) === 0 &&
          buffer.readUInt32LE(cursor + 28) === 0
    if (terminator) break
    if (nameRva !== 0) {
      const nameOffset = rvaToFile(nameRva)
      if (nameOffset < 0) throw new Error('Import name RVA is outside any section.')
      names.push(readCString(buffer, nameOffset).toLowerCase())
    }
    // Touch the lookup table so corrupt RVAs fail loudly instead of silently.
    if (lookupRva !== 0) {
      const lookupOffset = rvaToFile(lookupRva)
      if (lookupOffset < 0) throw new Error('Import lookup RVA is outside any section.')
      if (is64Bit) buffer.readBigUInt64LE(lookupOffset)
      else buffer.readUInt32LE(lookupOffset)
    }
    cursor += entrySize
    if (names.length > 4096) throw new Error('Import table is unreasonably large.')
  }
  return names
}

/**
 * List every DLL named by the regular and delay-load import tables of a PE
 * image. Names are returned lowercased. Throws on malformed input.
 */
function readPeImports(buffer) {
  if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) {
    throw new Error('Not a PE image (missing MZ header).')
  }
  const peOffset = buffer.readUInt32LE(0x3c)
  if (peOffset + 6 > buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('Not a PE image (missing PE signature).')
  }
  const coffOffset = peOffset + 4
  const machine = buffer.readUInt16LE(coffOffset)
  const sectionCount = buffer.readUInt16LE(coffOffset + 2)
  const optionalSize = buffer.readUInt16LE(coffOffset + 16)
  const optionalOffset = coffOffset + 20
  if (optionalSize < 96 || optionalOffset + optionalSize > buffer.length) {
    throw new Error('PE optional header is truncated.')
  }
  const magic = buffer.readUInt16LE(optionalOffset)
  const is64Bit =
    magic === OPTIONAL_MAGIC_PE32_PLUS
      ? true
      : magic === OPTIONAL_MAGIC_PE32
        ? false
        : null
  if (is64Bit === null) throw new Error('Unsupported PE optional-header magic.')
  const directoryOffset = optionalOffset + (is64Bit ? 112 : 96)
  if (directoryOffset + 16 * 8 > optionalOffset + optionalSize) {
    throw new Error('PE data directories are truncated.')
  }
  const importRva = buffer.readUInt32LE(directoryOffset + 1 * 8)
  const delayRva = buffer.readUInt32LE(directoryOffset + 13 * 8)
  const sectionOffset = optionalOffset + optionalSize
  const sections = []
  for (let i = 0; i < sectionCount; i += 1) {
    const base = sectionOffset + i * 40
    if (base + 40 > buffer.length) throw new Error('PE section table is truncated.')
    sections.push({
      virtualSize: buffer.readUInt32LE(base + 8),
      virtualAddress: buffer.readUInt32LE(base + 12),
      rawSize: buffer.readUInt32LE(base + 16),
      rawPointer: buffer.readUInt32LE(base + 20)
    })
  }
  const rvaToFile = (rva) => rvaToOffset(rva, sections)
  const names = [
    // IMAGE_IMPORT_DESCRIPTOR is 20 bytes; the DLL name is at offset 12.
    ...readImportDescriptors(buffer, rvaToFile, importRva, is64Bit, 20, 12),
    // IMAGE_DELAYLOAD_DESCRIPTOR is 32 bytes; the DLL name is at offset 4.
    ...readImportDescriptors(buffer, rvaToFile, delayRva, is64Bit, 32, 4)
  ]
  return { machine, imports: [...new Set(names)] }
}

function sha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function loadManifest(manifestPath) {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot read native-dependency manifest: ${manifestPath} (${error instanceof Error ? error.message : String(error)})`
    )
  }
  if (!manifest || typeof manifest !== 'object' || manifest.redistributables == null) {
    throw new Error(`Native-dependency manifest is invalid: ${manifestPath}`)
  }
  const declared = new Map()
  for (const [name, entry] of Object.entries(manifest.redistributables)) {
    declared.set(String(name).toLowerCase(), entry)
  }
  const windowsNative = new Set(
    ((manifest.windowsNative ?? []).map((name) => String(name).toLowerCase()))
  )
  return { manifest, declared, windowsNative }
}

function isWindowsApiSet(name) {
  return name.startsWith('api-ms-win-') || name.startsWith('ext-ms-')
}

/**
 * Verify one runtime directory. Returns { failures, checked } where each
 * failure is already formatted as `binary -> dependency -> strategy`.
 */
function verifyRuntimeDirectory(runtimeDirectory, manifestPath) {
  const root = resolve(runtimeDirectory)
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return {
      checked: 0,
      failures: [
        `runtime directory -> ${root} -> provision the llama.cpp binaries plus the vc-runtime.json redistributables before release (see resources/ai/README.md)`
      ]
    }
  }
  const { manifest, declared, windowsNative } = loadManifest(manifestPath)
  const strategy = manifest.strategy ?? 'declared prerequisite'
  const entries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(exe|dll)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  if (entries.length === 0) {
    return {
      checked: 0,
      failures: [
        `runtime directory -> ${root} -> no executables found; provision the llama.cpp runtime before release`
      ]
    }
  }
  const present = new Set(entries.map((name) => name.toLowerCase()))
  const failures = []

  for (const file of entries) {
    const absolute = join(root, file)
    let parsed
    try {
      parsed = readPeImports(readFileSync(absolute))
    } catch (error) {
      failures.push(
        `${file} -> unreadable PE image -> expected resolution strategy: ship only valid x64 binaries (${error instanceof Error ? error.message : String(error)})`
      )
      continue
    }
    if (parsed.machine !== IMAGE_FILE_MACHINE_AMD64) {
      failures.push(
        `${file} -> non-x64 image -> expected resolution strategy: provision the x64 llama.cpp + VC++ payload (arch must match the x64 runtime)`
      )
    }
    for (const imported of parsed.imports) {
      if (present.has(imported)) continue
      if (isWindowsApiSet(imported)) continue
      if (windowsNative.has(imported)) continue
      if (declared.has(imported)) {
        failures.push(
          `${file} -> ${imported} -> ${strategy}: declared in ${basename(manifestPath)} but not bundled in ${root}`
        )
        continue
      }
      failures.push(
        `${file} -> ${imported} -> neither bundled in ${root} nor declared in ${basename(manifestPath)}; bundle the sanctioned file app-locally or record an installer prerequisite`
      )
    }
  }

  // Declared redistributables must be present, x64, and bit-identical to the
  // qualified set so provenance/version regressions fail the release.
  for (const [name, entry] of declared) {
    const absolute = join(root, entries.find((file) => file.toLowerCase() === name) ?? name)
    if (!present.has(name)) {
      failures.push(
        `${basename(manifestPath)} declares -> ${name} -> ${strategy}: file is missing from ${root}`
      )
      continue
    }
    let parsed
    try {
      parsed = readPeImports(readFileSync(absolute))
    } catch (error) {
      failures.push(
        `${name} -> unreadable PE image -> expected resolution strategy: re-copy from the sanctioned source in ${basename(manifestPath)}`
      )
      continue
    }
    if (parsed.machine !== IMAGE_FILE_MACHINE_AMD64) {
      failures.push(
        `${name} -> non-x64 image -> expected resolution strategy: copy the x64 file from the sanctioned source in ${basename(manifestPath)}`
      )
    }
    if (entry && typeof entry === 'object') {
      if (typeof entry.sha256 === 'string') {
        const actual = sha256Of(absolute)
        if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
          failures.push(
            `${name} -> hash mismatch (got ${actual.slice(0, 16)}...) -> expected resolution strategy: re-copy the qualified ${entry.version ?? 'pinned'} file from the sanctioned source in ${basename(manifestPath)} and re-qualify`
          )
        }
      }
      if (typeof entry.bytes === 'number' && statSync(absolute).size !== entry.bytes) {
        failures.push(
          `${name} -> size mismatch -> expected resolution strategy: re-copy the qualified file from the sanctioned source in ${basename(manifestPath)}`
        )
      }
    }
  }

  return { checked: entries.length, failures: [...new Set(failures)] }
}

function parseArguments(argumentsList) {
  let manifestPath = join(__dirname, '..', 'resources', 'ai', 'vc-runtime.json')
  const positional = []
  for (let i = 0; i < argumentsList.length; i += 1) {
    if (argumentsList[i] === '--manifest') {
      const value = argumentsList[i + 1]
      if (!value) throw new Error('Missing value for --manifest.')
      manifestPath = value
      i += 1
    } else if (argumentsList[i].startsWith('--')) {
      throw new Error(`Unknown argument: ${argumentsList[i]}`)
    } else {
      positional.push(argumentsList[i])
    }
  }
  if (positional.length !== 1) {
    throw new Error('Usage: node scripts/verify-native-dependencies.cjs [--manifest <path>] <runtime-dir>')
  }
  return { manifestPath, runtimeDirectory: positional[0] }
}

function runCli(argumentsList = process.argv.slice(2)) {
  let options
  try {
    options = parseArguments(argumentsList)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
  let result
  try {
    result = verifyRuntimeDirectory(options.runtimeDirectory, options.manifestPath)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
  if (result.failures.length > 0) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`)
    process.stderr.write(
      `Native dependency validation failed: ${result.failures.length} unresolved entr${result.failures.length === 1 ? 'y' : 'ies'} across ${result.checked} binaries.\n`
    )
    process.exit(1)
  }
  process.stdout.write(
    `Native dependency validation passed: ${result.checked} binaries, all non-Windows dependencies bundled or declared.\n`
  )
  return result
}

if (require.main === module) {
  runCli()
}

module.exports = {
  parseArguments,
  readPeImports,
  verifyRuntimeDirectory
}
