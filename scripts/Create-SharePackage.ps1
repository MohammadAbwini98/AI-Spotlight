<#
.SYNOPSIS
  Builds transfer-friendly share packages for the final signed Setup and
  Portable artifacts (split parts + manifest + Reassemble.ps1 + README).

.DESCRIPTION
  Release-engineer convenience wrapper around scripts/split-release.ps1.
  Discovers DeepDive-<Version>-portable.exe and DeepDive-<Version>-setup.exe
  in the release directory, splits each into its own share package under
  release/share/<Version>/, and verifies every package with the
  release-integrity share verifier (manifest structure, part hashes, size
  totals, and original-artifact hash correspondence).

  Splitting is distribution tooling only: it runs after signing and never
  modifies the original artifacts.

.EXAMPLE
  .\scripts\Create-SharePackage.ps1 -Version "1.0.2" -ChunkSizeMB 20
#>
[CmdletBinding()]
param(
  [string]$Version = '',

  [int]$ChunkSizeMB = 20,

  [string]$ReleaseRoot = '',

  [string]$OutputRoot = '',

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([string]::IsNullOrWhiteSpace($Version)) {
  try {
    $packageJson = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw -Encoding UTF8 |
      ConvertFrom-Json
    $Version = $packageJson.version
  }
  catch {
    Fail "ERROR: could not determine version from package.json; pass -Version explicitly. ($($_.Exception.Message))"
  }
}
if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?$') {
  Fail "ERROR: invalid version: $Version"
}

$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($ReleaseRoot)) {
  $candidates += $ReleaseRoot
}
$candidates += Join-Path $repositoryRoot "release\local\DeepDive\$Version"
$candidates += Join-Path $repositoryRoot "release\DeepDive\$Version"
$releaseDirectory = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -First 1
if (-not $releaseDirectory) {
  Fail ("ERROR: release directory not found. Checked:`n" + ($candidates -join "`n"))
}

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $repositoryRoot "release\share\$Version"
}

$portableArtifact = Join-Path $releaseDirectory "DeepDive-$Version-portable.exe"
$setupArtifact = Join-Path $releaseDirectory "DeepDive-$Version-setup.exe"
$targets = @($setupArtifact, $portableArtifact) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
if ($targets.Count -eq 0) {
  Fail ("ERROR: no final artifacts found in:`n$releaseDirectory`nExpected DeepDive-$Version-portable.exe and/or DeepDive-$Version-setup.exe.")
}
foreach ($expected in @($setupArtifact, $portableArtifact)) {
  if (-not (Test-Path -LiteralPath $expected -PathType Leaf)) {
    Write-Warning "Skipping missing artifact: $([System.IO.Path]::GetFileName($expected))"
  }
}

$splitScript = Join-Path $PSScriptRoot 'split-release.ps1'
$createdPackages = @()
foreach ($artifact in $targets) {
  $arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $splitScript,
    '-InputFile', $artifact,
    '-ChunkSizeMB', "$ChunkSizeMB",
    '-OutputDirectory', $OutputRoot
  )
  if ($Force) { $arguments += '-Force' }
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments `
    -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    Fail "ERROR: splitting failed for $([System.IO.Path]::GetFileName($artifact)) (exit $($process.ExitCode))."
  }
  $createdPackages += Join-Path $OutputRoot ([System.IO.Path]::GetFileNameWithoutExtension($artifact))
}

# Verify every share package: manifest structure, part hashes, size totals,
# and correspondence with the signed original artifact.
$integrityScript = Join-Path $repositoryRoot 'scripts\release-integrity.cjs'
foreach ($packageDirectory in $createdPackages) {
  $baseName = Split-Path $packageDirectory -Leaf
  $original = Join-Path $releaseDirectory "$baseName.exe"
  & node $integrityScript --verify-share $packageDirectory --original $original
  if ($LASTEXITCODE -ne 0) {
    Fail "ERROR: share-package verification failed for: $packageDirectory"
  }
}

Write-Output ''
Write-Output "Share packages ready under: $OutputRoot"
foreach ($packageDirectory in $createdPackages) {
  Write-Output "  $packageDirectory"
}
exit 0
