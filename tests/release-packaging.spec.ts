import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const requireModule = createRequire(__filename)
const {
  assertPublicSigningAvailable,
  assertReleaseArtifacts,
  createReleasePlan,
  hasSigningLink,
  parseArguments
} = requireModule('../scripts/package-release.cjs') as {
  assertPublicSigningAvailable: (
    mode: 'public' | 'local',
    environment?: NodeJS.ProcessEnv,
    certificateAvailable?: boolean
  ) => void
  assertReleaseArtifacts: (plan: { portableArtifact: string; setupArtifact: string }) => void
  createReleasePlan: (
    repositoryRoot?: string,
    mode?: 'public' | 'local'
  ) => {
    mode: 'public' | 'local'
    version: string
    outputDirectory: string
    portableArtifact: string
    setupArtifact: string
    localCertificateArtifact: string | null
    localInstructionsArtifact: string | null
    builderArguments: string[]
  }
  hasSigningLink: (environment?: NodeJS.ProcessEnv) => boolean
  parseArguments: (argumentsList: string[]) => { dryRun: boolean; force: boolean; local: boolean }
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('Windows release packaging', () => {
  it('configures signed Portable and per-user Setup targets', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      build: {
        forceCodeSigning: boolean
        icon: string
        productName: string
        win: { icon: string; target: Array<{ target: string }> }
        portable: { artifactName: string }
        nsis: {
          artifactName: string
          oneClick: boolean
          perMachine: boolean
          shortcutName: string
        }
      }
    }
    const verificationScript = readFileSync('scripts/verify-release-security.ps1', 'utf8')

    expect(packageJson.build.forceCodeSigning).toBe(true)
    expect(packageJson.build.productName).toBe('DeepDive')
    expect(packageJson.build.icon).toBe('resources/icon.svg')
    expect(packageJson.build.win.icon).toBe('resources/icon.ico')
    expect(existsSync(packageJson.build.icon)).toBe(true)
    expect(existsSync(packageJson.build.win.icon)).toBe(true)
    expect(packageJson.build.win.target.map(({ target }) => target)).toEqual(['portable', 'nsis'])
    expect(packageJson.build.portable.artifactName).toBe('DeepDive-${version}-portable.exe')
    expect(packageJson.build.nsis).toMatchObject({
      artifactName: 'DeepDive-${version}-setup.${ext}',
      oneClick: false,
      perMachine: false,
      shortcutName: 'DeepDive'
    })
    expect(verificationScript).toContain("'DeepDive-*-setup.exe'")
  })

  it('plans versioned Portable and Setup artifacts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-release-plan-'))
    temporaryDirectories.push(root)
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ version: '2.3.4', build: { productName: 'DeepDive' } })
    )

    const plan = createReleasePlan(root)

    expect(plan.outputDirectory).toBe(join(root, 'release', 'DeepDive', '2.3.4'))
    expect(plan.portableArtifact).toBe(
      join(root, 'release', 'DeepDive', '2.3.4', 'DeepDive-2.3.4-portable.exe')
    )
    expect(plan.setupArtifact).toBe(
      join(root, 'release', 'DeepDive', '2.3.4', 'DeepDive-2.3.4-setup.exe')
    )
    expect(plan.builderArguments).toEqual(
      expect.arrayContaining(['--win', 'portable', 'nsis', '--x64'])
    )
  })

  it('isolates local-use releases and includes only the public certificate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-local-release-plan-'))
    temporaryDirectories.push(root)
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ version: '2.3.4', build: { productName: 'DeepDive' } })
    )

    const plan = createReleasePlan(root, 'local')

    expect(plan.outputDirectory).toBe(join(root, 'release', 'local', 'DeepDive', '2.3.4'))
    expect(plan.localCertificateArtifact).toBe(
      join(root, 'release', 'local', 'DeepDive', '2.3.4', 'DeepDive-Local.cer')
    )
    expect(plan.localInstructionsArtifact).toMatch(/LOCAL-CERTIFICATE-INSTALL\.txt$/)
    expect(JSON.stringify(plan)).not.toMatch(/\.pfx|password|private.?key/i)
  })

  it('requires both distributable executables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-release-artifacts-'))
    temporaryDirectories.push(root)
    mkdirSync(root, { recursive: true })
    const plan = {
      portableArtifact: join(root, 'DeepDive-1.0.0-portable.exe'),
      setupArtifact: join(root, 'DeepDive-1.0.0-setup.exe')
    }

    writeFileSync(plan.portableArtifact, 'portable')
    expect(() => assertReleaseArtifacts(plan)).toThrow(/setup\.exe/i)
    writeFileSync(plan.setupArtifact, 'setup')
    expect(() => assertReleaseArtifacts(plan)).not.toThrow()
  })

  it('supports only explicit dry-run and replacement switches', () => {
    expect(parseArguments(['--dry-run', '--force', '--local'])).toEqual({
      dryRun: true,
      force: true,
      local: true
    })
    expect(() => parseArguments(['--publish'])).toThrow(/unknown release argument/i)
  })

  it('fails public releases early when signing is not configured', () => {
    expect(hasSigningLink({ WIN_CSC_LINK: 'certificate.pfx' })).toBe(true)
    expect(hasSigningLink({ CSC_LINK: 'certificate.p12' })).toBe(true)
    expect(hasSigningLink({ WIN_CSC_LINK: '   ', CSC_LINK: '' })).toBe(false)

    expect(() => assertPublicSigningAvailable('public', {}, false)).toThrow(
      /npm run release:local/i
    )
    expect(() =>
      assertPublicSigningAvailable('public', { WIN_CSC_LINK: 'certificate.pfx' }, false)
    ).not.toThrow()
    expect(() => assertPublicSigningAvailable('public', {}, true)).not.toThrow()
    expect(() => assertPublicSigningAvailable('local', {}, false)).not.toThrow()
  })

  it('validates native runtime dependencies before and after packaging', () => {
    const releaseScript = readFileSync('scripts/package-release.cjs', 'utf8')
    const verificationScript = readFileSync('scripts/verify-release-security.ps1', 'utf8')

    expect(releaseScript).toContain('verify-native-dependencies.cjs')
    expect(verificationScript).toContain('verify-native-dependencies.cjs')
    expect(verificationScript).toContain('win-unpacked\\resources\\ai\\runtime')
  })

  it('creates a non-exportable current-user certificate and explicit trust instructions', () => {
    const preparationScript = readFileSync('scripts/prepare-local-signing.ps1', 'utf8')

    expect(preparationScript).toContain('-KeyExportPolicy NonExportable')
    expect(preparationScript).toContain("'Cert:\\CurrentUser\\My'")
    expect(preparationScript).toContain("'Cert:\\CurrentUser\\Root'")
    expect(preparationScript).toContain("'Cert:\\CurrentUser\\TrustedPublisher'")
    expect(preparationScript).toContain('DeepDive-Local.cer')
    expect(preparationScript).not.toMatch(/Export-PfxCertificate/i)
  })
})
