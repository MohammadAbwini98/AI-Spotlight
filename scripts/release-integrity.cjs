// Creates or verifies a deterministic SHA-256 inventory for release files.
const { createHash } = require('crypto')
const {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} = require('fs')
const { join, relative, resolve, sep } = require('path')

const MANIFEST = 'SHA256SUMS.json'

function listFiles(root, directory = root) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === MANIFEST || entry.name.endsWith('.integrity-tmp')) continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(root, absolute))
    else if (entry.isFile()) files.push(relative(root, absolute).split(sep).join('/'))
  }
  return files.sort()
}

function sha256(path) {
  // Streaming read: readFileSync refuses files larger than ~2 GiB, but
  // share packages routinely cover multi-GB models. Bounded 1 MiB buffer,
  // constant memory at any file size.
  const fd = openSync(path, 'r')
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null)
      if (read <= 0) break
      hash.update(buffer.subarray(0, read))
    }
    return hash.digest('hex')
  } finally {
    closeSync(fd)
  }
}

function createManifest(rootDirectory) {
  const root = resolve(rootDirectory)
  const files = listFiles(root)
  if (files.length === 0) throw new Error('Release directory contains no files.')
  const manifest = {
    algorithm: 'sha256',
    files: Object.fromEntries(files.map((file) => [file, sha256(join(root, file))]))
  }
  const target = join(root, MANIFEST)
  const temporary = `${target}.${process.pid}.integrity-tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    })
    if (existsSync(target)) rmSync(target, { force: true })
    renameSync(temporary, target)
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { force: true })
    throw error
  }
  return manifest
}

function verifyManifest(rootDirectory) {
  const root = resolve(rootDirectory)
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'))
  if (manifest.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object') {
    throw new Error('Release integrity manifest is invalid.')
  }
  const expectedFiles = Object.keys(manifest.files).sort()
  const actualFiles = listFiles(root)
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error('Release file inventory does not match the signed manifest set.')
  }
  for (const file of expectedFiles) {
    if (file.includes('..') || file.startsWith('/') || !statSync(join(root, file)).isFile()) {
      throw new Error('Release manifest contains an unsafe path.')
    }
    if (sha256(join(root, file)) !== manifest.files[file]) {
      throw new Error(`Release integrity check failed for ${file}.`)
    }
  }
  return true
}

function sharePackageType(manifest) {
  if (manifest && typeof manifest === 'object' && manifest.packageType != null) {
    return manifest.packageType
  }
  return 'application'
}

function shareFileName(manifest, packageType) {
  if (packageType === 'ai-model') {
    return manifest.modelFile ?? manifest.originalFile
  }
  return manifest.originalFile
}

function assertShareManifestStructure(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Share manifest is invalid JSON.')
  if (manifest.formatVersion !== 1) throw new Error('Share manifest formatVersion must be 1.')
  const packageType = sharePackageType(manifest)
  if (packageType !== 'application' && packageType !== 'ai-model') {
    throw new Error(`Share manifest packageType must be 'application' or 'ai-model'.`)
  }
  const fileName = shareFileName(manifest, packageType)
  const requiredText =
    packageType === 'ai-model' ? ['application', 'originalSha256'] : ['application', 'version', 'originalSha256']
  for (const field of requiredText) {
    if (typeof manifest[field] !== 'string' || manifest[field].length === 0) {
      throw new Error(`Share manifest field '${field}' is missing or empty.`)
    }
  }
  if (typeof fileName !== 'string' || fileName.length === 0) {
    throw new Error(
      packageType === 'ai-model'
        ? `Share manifest field 'modelFile' is missing or empty.`
        : `Share manifest field 'originalFile' is missing or empty.`
    )
  }
  for (const field of ['originalSize', 'chunkSizeBytes', 'partCount']) {
    if (!Number.isInteger(manifest[field]) || manifest[field] <= 0) {
      throw new Error(`Share manifest field '${field}' must be a positive integer.`)
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(manifest.originalSha256)) {
    throw new Error('Share manifest originalSha256 must be 64 hex characters.')
  }
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error(
      packageType === 'ai-model'
        ? 'Share manifest modelFile must be a plain file name.'
        : 'Share manifest originalFile must be a plain file name.'
    )
  }
  if (!Array.isArray(manifest.parts) || manifest.parts.length === 0) {
    throw new Error('Share manifest parts list is missing or empty.')
  }
  if (manifest.parts.length !== manifest.partCount) {
    throw new Error('Share manifest parts list length does not match partCount.')
  }
}

/**
 * Verify a split share package: manifest structure, exact part set, per-part
 * size/hash, size totals, and (when provided) correspondence of originalSha256
 * with the file used for splitting (signed artifact or source model).
 * Understands `packageType` "application" (default) and "ai-model".
 * Throws on any mismatch.
 */
function verifySharePackage(shareDirectory, originalFilePath = null) {
  const root = resolve(shareDirectory)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  } catch (error) {
    throw new Error(`Share manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  assertShareManifestStructure(manifest)
  const packageType = sharePackageType(manifest)
  const fileName = shareFileName(manifest, packageType)
  const { originalSize, originalSha256, chunkSizeBytes, partCount } = manifest
  const originalLabel = packageType === 'ai-model' ? 'Original model file' : 'Signed original artifact'

  const width = Math.max(3, String(partCount).length)
  const expectedNames = Array.from(
    { length: partCount },
    (_, index) => `${fileName}.part${String(index + 1).padStart(width, '0')}`
  )
  const seen = new Set()
  manifest.parts.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Share manifest part ${index + 1} is invalid.`)
    if (entry.name !== expectedNames[index]) {
      throw new Error(`Share manifest part ${index + 1} must be named ${expectedNames[index]}.`)
    }
    if (seen.has(entry.name)) throw new Error(`Share manifest contains a duplicate part: ${entry.name}.`)
    seen.add(entry.name)
    if (!Number.isInteger(entry.size) || entry.size <= 0) {
      throw new Error(`Share manifest part ${entry.name} needs a positive integer size.`)
    }
    if (!/^[0-9a-f]{64}$/i.test(entry.sha256 ?? '')) {
      throw new Error(`Share manifest part ${entry.name} needs a 64-character hex sha256.`)
    }
    const expectedSize =
      index === partCount - 1 ? originalSize - chunkSizeBytes * (partCount - 1) : chunkSizeBytes
    if (entry.size !== expectedSize) {
      throw new Error(`Share manifest part ${entry.name} size ${entry.size} does not match expected ${expectedSize}.`)
    }
  })

  const partsDirectory = join(root, 'parts')
  if (!existsSync(partsDirectory) || !statSync(partsDirectory).isDirectory()) {
    throw new Error('Share package parts directory is missing.')
  }
  const onDisk = readdirSync(partsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
  const expectedSorted = [...expectedNames].sort()
  if (JSON.stringify(onDisk) !== JSON.stringify(expectedSorted)) {
    const missing = expectedNames.filter((name) => !onDisk.includes(name))
    const extra = onDisk.filter((name) => !expectedNames.includes(name))
    const details = [
      ...(missing.length > 0 ? [`missing: ${missing.join(', ')}`] : []),
      ...(extra.length > 0 ? [`unexpected: ${extra.join(', ')}`] : [])
    ].join('; ')
    throw new Error(`Share package part set mismatch (${details}).`)
  }

  let total = 0
  for (const entry of manifest.parts) {
    const absolute = join(partsDirectory, entry.name)
    if (statSync(absolute).size !== entry.size) {
      throw new Error(`Share part size mismatch: ${entry.name}.`)
    }
    if (sha256(absolute) !== entry.sha256.toLowerCase()) {
      throw new Error(`Share part hash mismatch: ${entry.name}.`)
    }
    total += entry.size
  }
  if (total !== originalSize) {
    throw new Error(`Share part sizes sum to ${total}, expected originalSize ${originalSize}.`)
  }

  if (originalFilePath) {
    const absolute = resolve(originalFilePath)
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`${originalLabel} not found: ${originalFilePath}`)
    }
    if (statSync(absolute).size !== originalSize) {
      throw new Error(`${originalLabel} size does not match the share manifest.`)
    }
    if (sha256(absolute) !== originalSha256.toLowerCase()) {
      throw new Error(`${originalLabel} SHA-256 does not match the share manifest.`)
    }
  }

  return { packageType, fileName, partCount, originalSize, chunkSizeBytes }
}

if (require.main === module) {
  const [operation, root, ...rest] = process.argv.slice(2)
  if (operation === '--verify-share') {
    if (!root) {
      process.stderr.write(
        'Usage: node scripts/release-integrity.cjs --verify-share <share-dir> [--original <signed-artifact>]\n'
      )
      process.exit(2)
    }
    let original = null
    if (rest.length > 0) {
      if (rest.length !== 2 || rest[0] !== '--original') {
        process.stderr.write(
          'Usage: node scripts/release-integrity.cjs --verify-share <share-dir> [--original <signed-artifact>]\n'
        )
        process.exit(2)
      }
      original = rest[1]
    }
    try {
      const summary = verifySharePackage(root, original)
      const kind = summary.packageType === 'ai-model' ? 'MODEL' : 'APPLICATION'
      const subject = summary.packageType === 'ai-model' ? 'Model' : 'Application'
      process.stdout.write(
        [
          `${kind} SHARE PACKAGE: PASS`,
          `Parts: ${summary.partCount} / ${summary.partCount}`,
          `Total bytes: ${summary.originalSize}`,
          `${subject} SHA-256: VERIFIED`,
          ''
        ].join('\n')
      )
    } catch (error) {
      let kind = 'SHARE PACKAGE'
      try {
        const probed = JSON.parse(readFileSync(join(resolve(root), 'manifest.json'), 'utf8'))
        kind = `${sharePackageType(probed) === 'ai-model' ? 'MODEL' : 'APPLICATION'} SHARE PACKAGE`
      } catch {
        // Keep the generic label when the manifest itself is unreadable.
      }
      process.stderr.write(`${kind}: FAIL\n`)
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(1)
    }
  } else {
    if (!root || !['--create', '--verify'].includes(operation)) {
      process.stderr.write(
        'Usage: node scripts/release-integrity.cjs --create|--verify <release-dir>\n'
      )
      process.exit(2)
    }
    try {
      operation === '--create' ? createManifest(root) : verifyManifest(root)
      process.stdout.write(
        `Release integrity ${operation === '--create' ? 'manifest created' : 'verified'}.\n`
      )
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      process.exit(1)
    }
  }
}

module.exports = { createManifest, verifyManifest, verifySharePackage }
