<#
.SYNOPSIS
  Splits a final signed release artifact into numbered, hash-verified parts
  for sharing through size-restricted channels.

.DESCRIPTION
  Operates only AFTER the artifact has been built, signed, and verified.
  Never modifies the original file: it is read once with streaming I/O while
  part files, a manifest.json, a Reassemble.ps1, and a README.txt are written
  into <OutputDirectory>\<artifact-base-name>\.

  Memory usage stays constant regardless of input size (bounded 1 MiB buffer,
  Int64 arithmetic; files larger than 4 GB are supported).

.EXAMPLE
  .\scripts\split-release.ps1 -InputFile ".\dist\AI-Spotlight-1.0.2-Portable.exe" -ChunkSizeMB 20
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputFile,

  [int]$ChunkSizeMB = 20,

  # Advanced override for automated tests (takes precedence when positive).
  [long]$ChunkSizeBytes = 0,

  [string]$OutputDirectory = '',

  # Package directory name override (default: input file base name).
  [string]$OutputName = '',

  # 'application' preserves the original EXE share-package behavior exactly.
  # 'ai-model' writes the model manifest shape with modelFile/model metadata.
  [ValidateSet('application', 'ai-model')]
  [string]$PackageType = 'application',

  # Reassembly template copied into the package (resolved under scripts\share).
  [string]$ReassembleTemplateName = 'Reassemble.template.ps1',

  # File name of the copied reassembly script inside the package.
  [string]$ReassembleOutputName = 'Reassemble.ps1',

  # Optional ai-model metadata (only written when non-empty; never invented
  # by this script - callers source them from project configuration).
  [string]$ModelFamily = '',
  [string]$ModelSize = '',
  [string]$Quantization = '',
  [string]$RecommendedApplicationVersion = '',

  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$BufferSize = 1MB

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

if (-not (Test-Path -LiteralPath $InputFile -PathType Leaf)) {
  Fail "ERROR: input file not found:`n$InputFile"
}
$inputFull = [System.IO.Path]::GetFullPath($InputFile)
$inputInfo = Get-Item -LiteralPath $inputFull
[long]$originalSize = $inputInfo.Length
if ($originalSize -le 0) {
  Fail "ERROR: input file is empty, nothing to split:`n$inputFull"
}

[long]$chunkSize = if ($ChunkSizeBytes -gt 0) { $ChunkSizeBytes } else { [long]$ChunkSizeMB * 1MB }
if ($chunkSize -le 0) {
  Fail 'ERROR: chunk size must be positive (ChunkSizeMB >= 1 or ChunkSizeBytes >= 1).'
}

$originalName = [System.IO.Path]::GetFileName($inputFull)
$packageName = if ([string]::IsNullOrWhiteSpace($OutputName)) {
  [System.IO.Path]::GetFileNameWithoutExtension($inputFull)
}
else {
  $OutputName
}
if ($packageName -match '[\\/]') {
  Fail "ERROR: output name must be a plain directory name: $packageName"
}
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $inputInfo.DirectoryName 'share'
}
$packageDirectory = Join-Path $OutputDirectory $packageName
$partsDirectory = Join-Path $packageDirectory 'parts'
$manifestPath = Join-Path $packageDirectory 'manifest.json'

if ((Test-Path -LiteralPath $packageDirectory) -and
    (@(Get-ChildItem -LiteralPath $packageDirectory -Force -ErrorAction SilentlyContinue)).Count -gt 0 -and
    -not $Force) {
  Fail ("ERROR: output directory already exists and was left untouched:`n$packageDirectory`n" +
    'Re-run with -Force to replace it.')
}
if (Test-Path -LiteralPath $packageDirectory) {
  Remove-Item -LiteralPath $packageDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $partsDirectory -Force | Out-Null

# Integer part-count math (exact at any file size, including > 4 GB).
[long]$divRemainder = 0
[long]$quotient = [Math]::DivRem($originalSize, $chunkSize, [ref]$divRemainder)
[long]$remainder = $originalSize - ($quotient * $chunkSize)
[long]$partCount = if ($remainder -gt 0) { $quotient + 1 } else { $quotient }
$width = [Math]::Max(3, "$partCount".Length)

$templatePath = Join-Path $PSScriptRoot "share\$ReassembleTemplateName"
if ($ReassembleTemplateName -match '[\\/]|\.\.') {
  Fail "ERROR: reassembly template must be a plain file name: $ReassembleTemplateName"
}
if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
  Fail "ERROR: reassembly template not found:`n$templatePath"
}

$partEntries = @()
$originalHasher = $null
$inputStream = $null
try {
  $originalHasher = [System.Security.Cryptography.SHA256]::Create()
  $inputStream = [System.IO.File]::OpenRead($inputFull)
  $buffer = New-Object byte[] $BufferSize
  [long]$remaining = $originalSize
  for ($index = 1; $index -le $partCount; $index++) {
    $partName = "$originalName.part" + $index.ToString("D$width")
    $partPath = Join-Path $partsDirectory $partName
    [long]$toWrite = [Math]::Min($chunkSize, $remaining)
    [long]$partSize = $toWrite
    $partHasher = [System.Security.Cryptography.SHA256]::Create()
    $partStream = $null
    try {
      $partStream = [System.IO.File]::Create($partPath)
      while ($toWrite -gt 0) {
        [int]$wanted = if ($toWrite -gt $buffer.Length) { $buffer.Length } else { [int]$toWrite }
        [int]$read = $inputStream.Read($buffer, 0, $wanted)
        if ($read -le 0) {
          throw "Unexpected end of input while writing part: $partName"
        }
        $partStream.Write($buffer, 0, $read)
        $partHasher.TransformBlock($buffer, 0, $read, $null, 0) | Out-Null
        $originalHasher.TransformBlock($buffer, 0, $read, $null, 0) | Out-Null
        $toWrite -= $read
      }
    }
    finally {
      if ($partStream) { $partStream.Dispose() }
    }
    $partHasher.TransformFinalBlock(@(), 0, 0) | Out-Null
    $partHash = ([System.BitConverter]::ToString($partHasher.Hash)).Replace('-', '').ToLowerInvariant()
    $partHasher.Dispose()
    $partEntries += [ordered]@{ name = $partName; size = $partSize; sha256 = $partHash }
    $remaining -= $partSize
  }
  if ($remaining -ne 0) {
    throw "Internal error: $remaining bytes left after writing $partCount parts."
  }
}
finally {
  if ($inputStream) { $inputStream.Dispose() }
}
$originalHasher.TransformFinalBlock(@(), 0, 0) | Out-Null
$originalHash = ([System.BitConverter]::ToString($originalHasher.Hash)).Replace('-', '').ToLowerInvariant()
$originalHasher.Dispose()

$appName = 'AI Spotlight'
$appVersion = ''
if ($originalName -match '(\d+\.\d+\.\d+)') {
  $appVersion = $Matches[1]
}
if ($ReassembleOutputName -match '[\\/]') {
  Fail "ERROR: reassembly script name must be a plain file name: $ReassembleOutputName"
}
if ($PackageType -eq 'ai-model') {
  $manifest = [ordered]@{
    formatVersion = 1
    packageType   = 'ai-model'
    application   = $appName
    modelFile     = $originalName
  }
  if (-not [string]::IsNullOrWhiteSpace($ModelFamily)) { $manifest['modelFamily'] = $ModelFamily }
  if (-not [string]::IsNullOrWhiteSpace($ModelSize)) { $manifest['modelSize'] = $ModelSize }
  if (-not [string]::IsNullOrWhiteSpace($Quantization)) { $manifest['quantization'] = $Quantization }
  if (-not [string]::IsNullOrWhiteSpace($RecommendedApplicationVersion)) {
    $manifest['recommendedApplicationVersion'] = $RecommendedApplicationVersion
  }
  $manifest['originalSize'] = $originalSize
  $manifest['originalSha256'] = $originalHash
  $manifest['chunkSizeBytes'] = $chunkSize
  $manifest['partCount'] = $partCount
  $manifest['parts'] = $partEntries
}
else {
  $manifest = [ordered]@{
    formatVersion  = 1
    application    = $appName
    version        = $appVersion
    originalFile   = $originalName
    originalSize   = $originalSize
    originalSha256 = $originalHash
    chunkSizeBytes = $chunkSize
    partCount      = $partCount
    parts          = $partEntries
  }
}
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4), $utf8NoBom)

Copy-Item -LiteralPath $templatePath -Destination (Join-Path $packageDirectory $ReassembleOutputName)

if ($PackageType -eq 'ai-model') {
  $chunkLabel = if ($ChunkSizeBytes -gt 0) { "$chunkSize bytes" } else { "$ChunkSizeMB MB" }
  $readmeLines = @(
    'AI Spotlight - Gemma Model Package'
    ''
    'This model was divided into multiple files for easier transfer.'
    ''
    'REASSEMBLY'
    ''
    '1. Make sure ALL .part files are present in the "parts" folder.'
    "2. Keep manifest.json and $ReassembleOutputName together."
    '3. Run:'
    ''
    "   powershell -ExecutionPolicy Bypass -File .\$ReassembleOutputName"
    ''
    '4. Wait for verification to finish.'
    ''
    'The script will:'
    ''
    '- verify every model part'
    '- reconstruct the original GGUF'
    '- verify the final SHA-256 checksum'
    ''
    'Only use the reconstructed model if the script reports:'
    ''
    'MODEL SHA-256: VERIFIED'
    ''
    'After reconstruction, open AI Spotlight:'
    ''
    'Settings -> AI -> Select Model'
    ''
    'and select/import the reconstructed GGUF.'
    ''
    "Package: $packageName"
    "Model: $originalName"
    "Parts: $partCount x $chunkLabel (last part may be smaller)"
    "SHA-256: $originalHash"
    ''
    'Do not use an incomplete or unverified model file.'
    ''
  )
}
else {
$chunkLabel = if ($ChunkSizeBytes -gt 0) { "$chunkSize bytes" } else { "$ChunkSizeMB MB" }
$readmeLines = @(
  "$appName $appVersion"
  ''
  'This application was divided into multiple files to make it easier to transfer.'
  ''
  '1. Download/copy ALL .part files.'
  "2. Keep them in the supplied `"parts`" folder."
  '3. Keep manifest.json and Reassemble.ps1 together.'
  '4. Right-click Reassemble.ps1 and run with PowerShell.'
  ''
  'Or run:'
  ''
  'powershell -ExecutionPolicy Bypass -File .\Reassemble.ps1'
  ''
  'The script will:'
  ''
  '- verify every part'
  '- reconstruct the application'
  '- verify its SHA-256 checksum'
  ''
  "Package: $packageName"
  "Parts: $partCount x $chunkLabel (last part may be smaller)"
  "SHA-256: $originalHash"
  ''
  'Do not run the resulting application if checksum verification fails.'
  ''
)
}
$readmeText = $readmeLines -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $packageDirectory 'README.txt'), $readmeText, $utf8NoBom)

Write-Output "Share package created: $packageDirectory"
Write-Output "Parts: $partCount"
Write-Output "SHA-256: $originalHash"
exit 0
