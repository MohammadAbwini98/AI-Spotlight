<#
.SYNOPSIS
  Reconstructs the original signed AI Spotlight release artifact from its
  verified parts. Recipient-side script: requires only PowerShell.

.DESCRIPTION
  Reads manifest.json in this directory, verifies every part in .\parts
  (existence, count, ordering, size, SHA-256), concatenates the parts with
  binary streams, and accepts the output only when its size and SHA-256
  exactly match the manifest. Never executes the reconstructed file.

  Streaming I/O with a bounded buffer is used throughout; memory usage stays
  constant regardless of artifact size.
#>
[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$BufferSize = 1MB
$ManifestName = 'manifest.json'
$PartsDirectoryName = 'parts'

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

function GetFileSha256([string]$path) {
  $sha = $null
  $stream = $null
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($path)
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  }
  finally {
    if ($stream) { $stream.Dispose() }
    if ($sha) { $sha.Dispose() }
  }
}

function TestHex64([string]$value) {
  return $value -match '^[0-9a-fA-F]{64}$'
}

$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$manifestPath = Join-Path $root $ManifestName
$partsDirectory = Join-Path $root $PartsDirectoryName

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  Fail "ERROR: manifest not found:`n$manifestPath"
}
try {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
  Fail "ERROR: invalid manifest (not valid JSON):`n$manifestPath"
}

# --- Manifest structure validation -------------------------------------------
$requiredText = @('application', 'version', 'originalFile', 'originalSha256')
foreach ($field in $requiredText) {
  if (-not ($manifest.PSObject.Properties.Name -contains $field) -or
      -not ($manifest.$field -is [string]) -or
      [string]::IsNullOrWhiteSpace($manifest.$field)) {
    Fail "ERROR: invalid manifest: required text field '$field' is missing or empty."
  }
}
$requiredNumbers = @('originalSize', 'chunkSizeBytes', 'partCount')
foreach ($field in $requiredNumbers) {
  if (-not ($manifest.PSObject.Properties.Name -contains $field)) {
    Fail "ERROR: invalid manifest: required numeric field '$field' is missing."
  }
}
try {
  [long]$originalSize = $manifest.originalSize
  [long]$chunkSize = $manifest.chunkSizeBytes
  [long]$partCount = $manifest.partCount
}
catch {
  Fail 'ERROR: invalid manifest: originalSize, chunkSizeBytes, and partCount must be integers.'
}
if ($originalSize -le 0) { Fail 'ERROR: invalid manifest: originalSize must be positive.' }
if ($chunkSize -le 0) { Fail 'ERROR: invalid manifest: chunkSizeBytes must be positive.' }
if ($partCount -le 0) { Fail 'ERROR: invalid manifest: partCount must be positive.' }
if (-not (TestHex64 $manifest.originalSha256)) {
  Fail 'ERROR: invalid manifest: originalSha256 must be 64 hex characters.'
}
if ($manifest.originalFile -match '[\\/]' -or $manifest.originalFile -match '\.\.') {
  Fail 'ERROR: invalid manifest: originalFile must be a plain file name.'
}
if (-not $manifest.parts -or $manifest.parts.Count -eq 0) {
  Fail 'ERROR: invalid manifest: parts list is missing or empty.'
}
if ($manifest.parts.Count -ne $partCount) {
  Fail "ERROR: invalid manifest: parts list has $($manifest.parts.Count) entries but partCount is $partCount."
}

# Expected zero-padded names: width from total part count, minimum 3 digits.
$width = [Math]::Max(3, "$partCount".Length)
$expectedNames = @()
for ($i = 1; $i -le $partCount; $i++) {
  $expectedNames += "$($manifest.originalFile).part" + $i.ToString("D$width")
}
$seenNames = @{}
$orderedNames = @()
foreach ($entry in $manifest.parts) {
  if (-not $entry.name -or -not ($entry.name -is [string])) {
    Fail 'ERROR: invalid manifest: every part entry needs a name.'
  }
  if ($seenNames.ContainsKey($entry.name)) {
    Fail "ERROR: duplicate part in manifest:`n$($entry.name)"
  }
  $seenNames[$entry.name] = $true
  $orderedNames += $entry.name
  try {
    [long]$entrySize = $entry.size
  }
  catch {
    Fail "ERROR: invalid manifest: part '$($entry.name)' needs an integer size."
  }
  if ($entrySize -le 0) {
    Fail "ERROR: invalid manifest: part '$($entry.name)' needs a positive size."
  }
  if (-not (TestHex64 $entry.sha256)) {
    Fail "ERROR: invalid manifest: part '$($entry.name)' needs a 64-character hex sha256."
  }
}
# Correct ordering: manifest array must list parts 1..N in sequence.
for ($i = 0; $i -lt $partCount; $i++) {
  if ($orderedNames[$i] -ne $expectedNames[$i]) {
    Fail ("ERROR: incorrect part ordering in manifest:`nExpected entry {0}:`n{1}`nActual:`n{2}" -f
      ($i + 1), $expectedNames[$i], $orderedNames[$i])
  }
}
# Expected per-part sizes: full chunks except a smaller final part.
$sizeSum = [long]0
for ($i = 0; $i -lt $partCount; $i++) {
  $isLast = ($i -eq $partCount - 1)
  $expectedSize = if ($isLast) { $originalSize - $chunkSize * ($partCount - 1) } else { $chunkSize }
  if ($manifest.parts[$i].size -ne $expectedSize) {
    Fail ("ERROR: incorrect part size in manifest for:`n{0}`nExpected: {1}`nManifest: {2}" -f
      $expectedNames[$i], $expectedSize, $manifest.parts[$i].size)
  }
  $sizeSum += [long]$manifest.parts[$i].size
}
if ($sizeSum -ne $originalSize) {
  Fail ("ERROR: invalid manifest: sum of part sizes ({0}) does not equal originalSize ({1})." -f $sizeSum, $originalSize)
}

# --- Parts directory validation -----------------------------------------------
if (-not (Test-Path -LiteralPath $partsDirectory -PathType Container)) {
  Fail "ERROR: parts directory not found:`n$partsDirectory"
}
$actualFiles = Get-ChildItem -LiteralPath $partsDirectory -File | ForEach-Object { $_.Name }
$unexpected = $actualFiles | Where-Object { -not $seenNames.ContainsKey($_) }
if ($unexpected) {
  Fail ("ERROR: unexpected filenames in parts directory (possible duplicates or foreign files):`n" +
    ($unexpected -join "`n"))
}
foreach ($name in $expectedNames) {
  if (-not (Test-Path -LiteralPath (Join-Path $partsDirectory $name) -PathType Leaf)) {
    Fail "ERROR: Missing part:`n$name"
  }
}

# --- Per-part size + hash verification -----------------------------------------
$verified = 0
for ($i = 0; $i -lt $partCount; $i++) {
  $entry = $manifest.parts[$i]
  $path = Join-Path $partsDirectory $entry.name
  $actualSize = (Get-Item -LiteralPath $path).Length
  if ($actualSize -ne [long]$entry.size) {
    Fail ("ERROR: incorrect part size:`n{0}`nExpected: {1}`nActual: {2}" -f
      $entry.name, $entry.size, $actualSize)
  }
  $actualHash = GetFileSha256 $path
  if ($actualHash -ne $entry.sha256.ToLowerInvariant()) {
    Fail ("ERROR: SHA-256 mismatch for part:`n{0}`nExpected:`n{1}`nActual:`n{2}`n`nThe reconstructed application has NOT been accepted." -f
      $entry.name, $entry.sha256, $actualHash)
  }
  $verified++
}

# --- Reassembly (binary streams, bounded buffer) --------------------------------
$destination = Join-Path $root $manifest.originalFile
if ((Test-Path -LiteralPath $destination) -and -not $Force) {
  Fail ("ERROR: destination file already exists and was left untouched:`n$destination`n" +
    'Delete it yourself or re-run with -Force to reconstruct again.')
}
if ((Test-Path -LiteralPath $destination) -and $Force) {
  Remove-Item -LiteralPath $destination -Force
}
$outStream = $null
try {
  $outStream = [System.IO.File]::Create($destination)
  $buffer = New-Object byte[] $BufferSize
  foreach ($entry in $manifest.parts) {
    $inStream = $null
    try {
      $inStream = [System.IO.File]::OpenRead((Join-Path $partsDirectory $entry.name))
      while (($read = $inStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $outStream.Write($buffer, 0, $read)
      }
    }
    finally {
      if ($inStream) { $inStream.Dispose() }
    }
  }
}
finally {
  if ($outStream) { $outStream.Dispose() }
}

# --- Final acceptance: size + hash ----------------------------------------------
$rebuiltSize = (Get-Item -LiteralPath $destination).Length
if ($rebuiltSize -ne $originalSize) {
  Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
  Fail ("ERROR: reconstructed size mismatch:`nExpected: {0}`nActual: {1}`n`nThe reconstructed application has NOT been accepted." -f
    $originalSize, $rebuiltSize)
}
$rebuiltHash = GetFileSha256 $destination
if ($rebuiltHash -ne $manifest.originalSha256.ToLowerInvariant()) {
  Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
  Fail ("ERROR: SHA-256 mismatch:`n`nExpected:`n{0}`n`nActual:`n{1}`n`nThe reconstructed application has NOT been accepted." -f
    $manifest.originalSha256, $rebuiltHash)
}

Write-Output ''
Write-Output 'AI Spotlight package reconstructed successfully.'
Write-Output ''
Write-Output 'File:'
Write-Output $manifest.originalFile
Write-Output ''
Write-Output 'Parts:'
Write-Output "$verified / $partCount verified"
Write-Output ''
Write-Output 'SHA-256:'
Write-Output 'MATCH'
Write-Output ''
Write-Output 'The reconstructed file is identical to the signed release artifact.'
exit 0
