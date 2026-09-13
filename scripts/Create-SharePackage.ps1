<#
.SYNOPSIS
  Builds transfer-friendly share packages for the final signed Setup and
  Portable artifacts (split parts + manifest + Reassemble.ps1 + README).

.DESCRIPTION
  Release-engineer convenience wrapper around scripts/split-release.ps1.
  Discovers DeepDive-<Version>-portable.exe and DeepDive-<Version>-setup.exe
  in the release directory, splits each into its own share package, and
  verifies every package with the release-integrity share verifier
  (manifest structure, part hashes, size totals, and original-artifact hash
  correspondence).

  With -ModelPath, builds the complete offline distribution instead:
  release/share/AI-Spotlight-<Version>/ with Application/{Setup,Portable},
  Model/<gguf-base>/, and a root README.txt. Application and model chunk
  sizes are independently configurable (defaults 20 MB / 100 MB).

  Splitting is distribution tooling only: it runs after signing and never
  modifies the original artifacts.

.EXAMPLE
  .\scripts\Create-SharePackage.ps1 -Version "1.0.2" -ChunkSizeMB 20
.EXAMPLE
  .\scripts\Create-SharePackage.ps1 -Version "1.0.2" -ModelPath "D:\Models\gemma-4-12b-it-Q4_K_M.gguf"
#>
[CmdletBinding()]
param(
  [string]$Version = '',

  [int]$ChunkSizeMB = 20,

  # Application chunk-size override (default: use -ChunkSizeMB).
  [int]$ApplicationChunkSizeMB = 0,

  # Optional GGUF model for the complete offline distribution.
  [string]$ModelPath = '',

  [int]$ModelChunkSizeMB = 100,

  # Optional model metadata overrides (explicit values win; otherwise the
  # application model manifest is consulted on filename match).
  [string]$ModelFamily = '',
  [string]$ModelSizeLabel = '',
  [string]$Quantization = '',

  [string]$ReleaseRoot = '',

  [string]$OutputRoot = '',

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Start-Process joins -ArgumentList into one command line WITHOUT quoting
# elements that contain spaces, so every value must be quoted explicitly.
function Q([string]$value) {
  return '"' + ($value -replace '"', '\"') + '"'
}

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
  if ([string]::IsNullOrWhiteSpace($ModelPath)) {
    $OutputRoot = Join-Path $repositoryRoot "release\share\$Version"
  }
  else {
    $OutputRoot = Join-Path $repositoryRoot "release\share\AI-Spotlight-$Version"
  }
}
$completeOffline = -not [string]::IsNullOrWhiteSpace($ModelPath)

[int]$appChunkMB = if ($ApplicationChunkSizeMB -gt 0) { $ApplicationChunkSizeMB } else { $ChunkSizeMB }
if ($appChunkMB -le 0) {
  Fail 'ERROR: application chunk size must be positive.'
}
if ($completeOffline -and $ModelChunkSizeMB -le 0) {
  Fail 'ERROR: model chunk size must be positive.'
}
if ($completeOffline -and -not (Test-Path -LiteralPath $ModelPath -PathType Leaf)) {
  Fail "ERROR: model file not found:`n$ModelPath"
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
# Explicit (package directory, original file) pairs: the complete offline
# layout renames application packages to Setup/Portable, so the original
# file cannot be re-derived from the directory name alone.
$createdPackages = @()
$applicationOutputRoot = if ($completeOffline) { Join-Path $OutputRoot 'Application' } else { $OutputRoot }
foreach ($artifact in $targets) {
  $arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Q $splitScript),
    '-InputFile', (Q $artifact),
    '-ChunkSizeMB', "$appChunkMB",
    '-OutputDirectory', (Q $applicationOutputRoot)
  )
  $packageLeaf = [System.IO.Path]::GetFileNameWithoutExtension($artifact)
  if ($completeOffline) {
    $baseName = [System.IO.Path]::GetFileName($artifact)
    if ($baseName -match "^DeepDive-.+-(portable|setup)\.exe$") {
      $packageLeaf = $Matches[1].Substring(0, 1).ToUpper() + $Matches[1].Substring(1).ToLower()
    }
    $arguments += @('-OutputName', (Q $packageLeaf))
  }
  if ($Force) { $arguments += '-Force' }
  $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments `
    -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    Fail "ERROR: splitting failed for $([System.IO.Path]::GetFileName($artifact)) (exit $($process.ExitCode))."
  }
  $createdPackages += [pscustomobject]@{
    PackageDirectory = Join-Path $applicationOutputRoot $packageLeaf
    OriginalFile     = $artifact
  }
}

if ($completeOffline) {
  $modelSplitScript = Join-Path $PSScriptRoot 'split-model.ps1'
  $modelArguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Q $modelSplitScript),
    '-ModelPath', (Q ([System.IO.Path]::GetFullPath($ModelPath))),
    '-ChunkSizeMB', "$ModelChunkSizeMB",
    '-OutputDirectory', (Q (Join-Path $OutputRoot 'Model'))
  )
  if (-not [string]::IsNullOrWhiteSpace($ModelFamily)) { $modelArguments += @('-ModelFamily', (Q $ModelFamily)) }
  if (-not [string]::IsNullOrWhiteSpace($ModelSizeLabel)) { $modelArguments += @('-ModelSizeLabel', (Q $ModelSizeLabel)) }
  if (-not [string]::IsNullOrWhiteSpace($Quantization)) { $modelArguments += @('-Quantization', (Q $Quantization)) }
  if ($Force) { $modelArguments += '-Force' }
  $modelProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $modelArguments `
    -NoNewWindow -Wait -PassThru
  if ($modelProcess.ExitCode -ne 0) {
    Fail "ERROR: model splitting failed (exit $($modelProcess.ExitCode))."
  }
  $modelBaseName = [System.IO.Path]::GetFileNameWithoutExtension($ModelPath)
  $createdPackages += [pscustomobject]@{
    PackageDirectory = Join-Path (Join-Path $OutputRoot 'Model') $modelBaseName
    OriginalFile     = ([System.IO.Path]::GetFullPath($ModelPath))
  }
}

# Verify every share package: manifest structure, part hashes, size totals,
# and correspondence with the original file used for splitting.
$integrityScript = Join-Path $repositoryRoot 'scripts\release-integrity.cjs'
foreach ($package in $createdPackages) {
  & node $integrityScript --verify-share $package.PackageDirectory --original $package.OriginalFile
  if ($LASTEXITCODE -ne 0) {
    Fail "ERROR: share-package verification failed for: $($package.PackageDirectory)"
  }
}

if ($completeOffline) {
  $modelDirName = [System.IO.Path]::GetFileNameWithoutExtension($ModelPath)
  $rootReadme = @(
    "AI Spotlight $Version - Offline Distribution"
    ''
    'This directory contains two independent packages:'
    ''
    '1. Application (Application/Setup OR Application/Portable - pick one)'
    '2. AI Model (Model/' + $modelDirName + ')'
    ''
    'Each package reassembles and verifies independently. Reassemble the'
    'application and the model in any order.'
    ''
    'RECOMMENDED RECIPIENT ORDER'
    ''
    'A. Reassemble Setup OR Portable (Application/Setup or Application/Portable)'
    'B. Verify the application package (automatic inside Reassemble.ps1)'
    'C. Reassemble the GGUF model (Model/' + $modelDirName + ')'
    'D. Verify the model SHA-256 (automatic inside Reassemble-Model.ps1)'
    'E. Launch AI Spotlight'
    'F. Open Settings -> AI'
    'G. Import/select the reconstructed GGUF'
    'H. Start AI Chat'
    ''
    'You do not need both Setup and Portable: choose one application distribution.'
    'Application and model packages are versioned and replaced independently.'
    ''
  ) -join "`r`n"
  [System.IO.File]::WriteAllText(
    (Join-Path $OutputRoot 'README.txt'),
    $rootReadme,
    (New-Object System.Text.UTF8Encoding $false))
}

Write-Output ''
Write-Output "Share packages ready under: $OutputRoot"
foreach ($package in $createdPackages) {
  Write-Output ("  " + $package.PackageDirectory)
}
exit 0
