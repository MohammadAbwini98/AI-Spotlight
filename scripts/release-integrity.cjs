// Creates or verifies a deterministic SHA-256 inventory for release files.
const { createHash } = require('crypto')
const {
  existsSync,
  readFileSync,
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
  return createHash('sha256').update(readFileSync(path)).digest('hex')
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

if (require.main === module) {
  const [operation, root] = process.argv.slice(2)
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

module.exports = { createManifest, verifyManifest }
