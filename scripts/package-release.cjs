// Builds a signed Windows release containing Portable and Setup executables.
// Signing credentials are read by electron-builder from its standard environment variables
// (for example WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD) or the Windows certificate store.
// Their values are never read or printed by this script.
const { existsSync, readFileSync, rmSync, statSync } = require('fs')
const { dirname, join, relative, resolve, sep } = require('path')
const { spawnSync } = require('child_process')

const REPOSITORY_ROOT = resolve(__dirname, '..')

function readPackageMetadata(repositoryRoot = REPOSITORY_ROOT) {
  const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
    throw new Error(`Invalid release version: ${String(packageJson.version)}`)
  }
  return { version: packageJson.version, productName: packageJson.build?.productName }
}

function createReleasePlan(repositoryRoot = REPOSITORY_ROOT, mode = 'public') {
  if (!['public', 'local'].includes(mode)) throw new Error(`Invalid release mode: ${mode}`)
  const { version, productName } = readPackageMetadata(repositoryRoot)
  if (productName !== 'DeepDive') {
    throw new Error('The release script requires build.productName to be DeepDive.')
  }

  const releaseRoot = resolve(
    repositoryRoot,
    'release',
    ...(mode === 'local' ? ['local', productName] : [productName])
  )
  const outputDirectory = resolve(releaseRoot, version)
  if (dirname(outputDirectory) !== releaseRoot) {
    throw new Error('Unsafe release output path.')
  }

  const outputRelative = relative(repositoryRoot, outputDirectory).split(sep).join('/')
  return {
    mode,
    version,
    outputDirectory,
    outputRelative,
    portableArtifact: join(outputDirectory, `DeepDive-${version}-portable.exe`),
    setupArtifact: join(outputDirectory, `DeepDive-${version}-setup.exe`),
    localCertificateArtifact:
      mode === 'local' ? join(outputDirectory, 'DeepDive-Local.cer') : null,
    localInstructionsArtifact:
      mode === 'local' ? join(outputDirectory, 'LOCAL-CERTIFICATE-INSTALL.txt') : null,
    builderArguments: [
      '--win',
      'portable',
      'nsis',
      '--x64',
      `--config.directories.output=${outputRelative}`
    ]
  }
}

function parseArguments(argumentsList) {
  const supported = new Set(['--dry-run', '--force', '--local'])
  const unknown = argumentsList.filter((argument) => !supported.has(argument))
  if (unknown.length > 0) {
    throw new Error(`Unknown release argument: ${unknown.join(', ')}`)
  }
  return {
    dryRun: argumentsList.includes('--dry-run'),
    force: argumentsList.includes('--force'),
    local: argumentsList.includes('--local')
  }
}

function hasSigningLink(environment = process.env) {
  return ['WIN_CSC_LINK', 'CSC_LINK'].some((name) => {
    const value = environment[name]
    return typeof value === 'string' && value.trim().length > 0
  })
}

function hasPublicCertificateInWindowsStore() {
  if (process.platform !== 'win32') return false

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      [
        "$certificates = @(",
        "  Get-ChildItem -LiteralPath 'Cert:\\CurrentUser\\My' -CodeSigningCert -ErrorAction SilentlyContinue",
        "  Get-ChildItem -LiteralPath 'Cert:\\LocalMachine\\My' -CodeSigningCert -ErrorAction SilentlyContinue",
        ') | Where-Object {',
        '  $_.HasPrivateKey -and',
        '  $_.NotAfter -gt (Get-Date) -and',
        '  $_.Subject -ne $_.Issuer -and',
        "  $_.Subject -notlike 'CN=* Local Use'",
        '}',
        'if ($certificates.Count -gt 0) { exit 0 }',
        'exit 1'
      ].join('\n')
    ],
    { cwd: REPOSITORY_ROOT, windowsHide: true, stdio: 'ignore' }
  )

  return result.status === 0
}

function assertPublicSigningAvailable(
  mode,
  environment = process.env,
  certificateAvailable
) {
  if (mode === 'local' || hasSigningLink(environment)) return
  if (certificateAvailable ?? hasPublicCertificateInWindowsStore()) return

  throw new Error(
    [
      'Public release signing is not configured.',
      'Set WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD, or install an eligible public code-signing certificate.',
      'For private-use builds on your own machines, run: npm run release:local'
    ].join(' ')
  )
}

function run(command, argumentsList, label, environment = process.env) {
  process.stdout.write(`\n==> ${label}\n`)
  const result = spawnSync(command, argumentsList, {
    cwd: REPOSITORY_ROOT,
    env: environment,
    stdio: 'inherit',
    windowsHide: true
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status)}.`)
  }
}

function assertReleaseArtifacts(plan) {
  const artifacts = [
    plan.portableArtifact,
    plan.setupArtifact,
    plan.localCertificateArtifact,
    plan.localInstructionsArtifact
  ].filter(Boolean)
  for (const artifact of artifacts) {
    if (!existsSync(artifact) || !statSync(artifact).isFile()) {
      throw new Error(`Expected release artifact was not created: ${artifact}`)
    }
  }
}

function printPlan(plan, force) {
  const replacement = existsSync(plan.outputDirectory)
    ? force
      ? 'The existing version directory will be replaced.'
      : 'The existing version directory would block the release; pass --force to replace it.'
    : 'A new version directory will be created.'
  process.stdout.write(
    [
      `DeepDive ${plan.version} ${plan.mode} release plan`,
      `Output: ${plan.outputDirectory}`,
      `Portable: ${plan.portableArtifact}`,
      `Setup: ${plan.setupArtifact}`,
      ...(plan.localCertificateArtifact
        ? [`Public local-use certificate: ${plan.localCertificateArtifact}`]
        : []),
      replacement,
      'Checks: typecheck, lint, tests, production build, Authenticode signatures, migrations, SHA-256 inventory'
    ].join('\n') + '\n'
  )
}

function prepareLocalSigning(plan) {
  const metadataPath = join(plan.outputDirectory, '.local-signing.json')
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(REPOSITORY_ROOT, 'scripts', 'prepare-local-signing.ps1'),
      '-CertificateOutput',
      plan.localCertificateArtifact,
      '-MetadataOutput',
      metadataPath
    ],
    'Local signing certificate preparation'
  )

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''))
    if (
      !/^[A-F0-9]{40}$/i.test(metadata.thumbprint) ||
      metadata.subject !== 'CN=DeepDive Local Use'
    ) {
      throw new Error('Local signing certificate metadata is invalid.')
    }
    return metadata
  } finally {
    rmSync(metadataPath, { force: true })
  }
}

function runRelease(argumentsList = process.argv.slice(2)) {
  const options = parseArguments(argumentsList)
  const plan = createReleasePlan(REPOSITORY_ROOT, options.local ? 'local' : 'public')
  printPlan(plan, options.force)
  if (options.dryRun) return plan
  assertPublicSigningAvailable(plan.mode)

  if (existsSync(plan.outputDirectory)) {
    if (!options.force) {
      throw new Error(
        `Release output already exists: ${plan.outputDirectory}. Re-run with --force to replace it.`
      )
    }
    rmSync(plan.outputDirectory, { recursive: true, force: true })
  }

  const npmCli = process.env.npm_execpath
  if (!npmCli || !existsSync(npmCli)) {
    throw new Error('Run this release workflow through npm: npm run release')
  }

  run(process.execPath, [npmCli, 'run', 'typecheck'], 'Type checking')
  run(process.execPath, [npmCli, 'run', 'lint'], 'Linting')
  run(process.execPath, [npmCli, 'test'], 'Automated tests')
  run(process.execPath, [npmCli, 'run', 'build'], 'Production build')

  let signingEnvironment = process.env
  if (options.local) {
    const certificate = prepareLocalSigning(plan)
    plan.builderArguments.push(
      `--config.win.signtoolOptions.certificateSha1=${certificate.thumbprint}`
    )
    signingEnvironment = {
      ...process.env,
      CSC_LINK: '',
      CSC_KEY_PASSWORD: '',
      WIN_CSC_LINK: '',
      WIN_CSC_KEY_PASSWORD: '',
      SPOTLIGHT_TODO_SIGNER_SUBJECT: 'DeepDive Local Use'
    }
  }

  const electronBuilderCli = require.resolve('electron-builder/cli.js')
  run(
    process.execPath,
    [electronBuilderCli, ...plan.builderArguments],
    'Windows packaging',
    signingEnvironment
  )
  assertReleaseArtifacts(plan)

  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      join(REPOSITORY_ROOT, 'scripts', 'verify-release-security.ps1'),
      '-ReleaseDirectory',
      plan.outputDirectory
    ],
    'Release security verification',
    signingEnvironment
  )

  process.stdout.write(
    [
      '',
      'Release complete.',
      `Portable: ${plan.portableArtifact}`,
      `Setup: ${plan.setupArtifact}`,
      ...(plan.localCertificateArtifact
        ? [`Public local-use certificate: ${plan.localCertificateArtifact}`]
        : [])
    ].join('\n') + '\n'
  )
  return plan
}

if (require.main === module) {
  try {
    runRelease()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

module.exports = {
  assertReleaseArtifacts,
  assertPublicSigningAvailable,
  createReleasePlan,
  hasSigningLink,
  parseArguments,
  readPackageMetadata,
  runRelease
}
