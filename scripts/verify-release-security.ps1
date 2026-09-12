param(
  [string]$ReleaseDirectory = (Join-Path $PSScriptRoot '..\release'),
  [switch]$VerifyExistingManifest
)

$ErrorActionPreference = 'Stop'
$releaseRoot = [System.IO.Path]::GetFullPath($ReleaseDirectory)
if (-not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
  throw "Release directory does not exist: $releaseRoot"
}

$executables = @(
  Get-ChildItem -LiteralPath $releaseRoot -File -Filter 'DeepDive-*-portable.exe'
  Get-ChildItem -LiteralPath $releaseRoot -File -Filter 'DeepDive-*-setup.exe'
  Get-ChildItem -LiteralPath (Join-Path $releaseRoot 'win-unpacked') -File -Filter 'DeepDive.exe' -ErrorAction SilentlyContinue
)
if ($executables.Count -eq 0) { throw 'No DeepDive release executables were found.' }

foreach ($executable in $executables) {
  $signature = Get-AuthenticodeSignature -LiteralPath $executable.FullName
  if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
    throw "Unsigned or invalid release executable: $($executable.Name)"
  }
  if (
    $env:SPOTLIGHT_TODO_SIGNER_SUBJECT -and
    $signature.SignerCertificate.Subject -notlike "*$($env:SPOTLIGHT_TODO_SIGNER_SUBJECT)*"
  ) {
    throw "Unexpected signing identity for $($executable.Name)."
  }
}

$sourceMigrations = @(
  Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\electron\main\db\migrations') -File -Filter '*.sql' |
    Sort-Object Name |
    ForEach-Object Name
)
$packagedMigrationDirectory = Join-Path $releaseRoot 'win-unpacked\resources\migrations'
$packagedMigrations = @(
  Get-ChildItem -LiteralPath $packagedMigrationDirectory -File -Filter '*.sql' -ErrorAction Stop |
    Sort-Object Name |
    ForEach-Object Name
)
if (($sourceMigrations -join "`n") -ne ($packagedMigrations -join "`n")) {
  throw 'Packaged migration inventory does not match source migrations.'
}

$packagedRuntimeDirectory = Join-Path $releaseRoot 'win-unpacked\resources\ai\runtime'
& node (Join-Path $PSScriptRoot 'verify-native-dependencies.cjs') $packagedRuntimeDirectory
if ($LASTEXITCODE -ne 0) { throw 'Packaged AI runtime has unresolved native dependencies.' }

$integrityScript = Join-Path $PSScriptRoot 'release-integrity.cjs'
if ($VerifyExistingManifest) {
  & node $integrityScript --verify $releaseRoot
} else {
  & node $integrityScript --create $releaseRoot
}
if ($LASTEXITCODE -ne 0) { throw 'Release integrity verification failed.' }

Write-Output 'Release signatures, migrations, native dependencies, and SHA-256 inventory are valid.'
