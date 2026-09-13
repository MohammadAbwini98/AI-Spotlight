<#
.SYNOPSIS
  Splits a GGUF AI model file into numbered, hash-verified parts for
  offline distribution, independently from the application packages.

.DESCRIPTION
  Validates that the source looks like a supported GGUF model (extension,
  GGUF magic bytes, and the size bounds from resources/ai/model-manifest.json),
  then delegates the streaming binary split to scripts/split-release.ps1 with
  the ai-model package shape (model manifest, Reassemble-Model.ps1, model
  README). Never modifies the source file and never embeds the model into
  application artifacts.

.EXAMPLE
  .\scripts\split-model.ps1 -ModelPath "D:\Models\gemma-4-12b-it-Q4_K_M.gguf" -ChunkSizeMB 100
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ModelPath,

  [int]$ChunkSizeMB = 100,

  # Advanced override for automated tests (takes precedence when positive).
  [long]$ChunkSizeBytes = 0,

  [string]$OutputDirectory = '',

  # Package directory name override (default: model file base name).
  [string]$OutputName = '',

  # Size bounds default to the application's model manifest. Those bounds
  # (currently 6-12 GB) belong to the selected Gemma 4 12B Q4_K_M deployment
  # contract in resources/ai/model-manifest.json - they are NOT generic
  # GGUF-format requirements. Overridable for tests.
  [long]$MinimumFileBytes = 0,
  [long]$MaximumFileBytes = 0,

  # Optional metadata overrides (explicit values win over manifest-derived ones).
  [string]$ModelFamily = '',
  [string]$ModelSizeLabel = '',
  [string]$Quantization = '',
  [string]$RecommendedApplicationVersion = '',

  [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Start-Process joins -ArgumentList into one command line WITHOUT quoting
# elements that contain spaces, so every value must be quoted explicitly.
# Otherwise a value like "Gemma 4" splits and the stray token binds to an
# unrelated parameter positionally (previously observed: chunk size became 4).
function Q([string]$value) {
  return '"' + ($value -replace '"', '\"') + '"'
}

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

if (-not (Test-Path -LiteralPath $ModelPath -PathType Leaf)) {
  Fail "ERROR: model file not found:`n$ModelPath"
}
$modelFull = [System.IO.Path]::GetFullPath($ModelPath)
$modelInfo = Get-Item -LiteralPath $modelFull
if ($modelInfo -is [System.IO.DirectoryInfo]) {
  Fail "ERROR: model path is a directory, not a file:`n$modelFull"
}
$modelName = [System.IO.Path]::GetFileName($modelFull)
if (-not $modelName.ToLowerInvariant().EndsWith('.gguf')) {
  Fail "ERROR: Source file is not a valid supported GGUF model (expected a .gguf file):`n$modelFull"
}
# GGUF magic: first four bytes must be "GGUF". Shallow header probe only;
# the model is never loaded or parsed here.
$probeStream = $null
try {
  $probeStream = [System.IO.File]::OpenRead($modelFull)
  $magic = New-Object byte[] 4
  $read = $probeStream.Read($magic, 0, 4)
  if ($read -lt 4 -or
      $magic[0] -ne 0x47 -or $magic[1] -ne 0x47 -or $magic[2] -ne 0x55 -or $magic[3] -ne 0x46) {
    Fail "ERROR: Source file is not a valid supported GGUF model (bad magic header):`n$modelFull"
  }
}
finally {
  if ($probeStream) { $probeStream.Dispose() }
}

$appManifestPath = Join-Path $repositoryRoot 'resources\ai\model-manifest.json'
$appManifest = $null
try {
  $appManifest = Get-Content -LiteralPath $appManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
  Write-Warning "Could not read application model manifest; size metadata checks use explicit bounds only. ($($_.Exception.Message))"
}
if ($MinimumFileBytes -le 0 -and $appManifest -and $appManifest.minimumFileBytes -gt 0) {
  [long]$MinimumFileBytes = $appManifest.minimumFileBytes
}
if ($MaximumFileBytes -le 0 -and $appManifest -and $appManifest.maximumFileBytes -gt 0) {
  [long]$MaximumFileBytes = $appManifest.maximumFileBytes
}
[long]$modelSize = $modelInfo.Length
if ($MinimumFileBytes -gt 0 -and $modelSize -lt $MinimumFileBytes) {
  Fail ("ERROR: Source file is not a valid supported GGUF model " +
    "(size $modelSize bytes is below the $MinimumFileBytes-byte minimum):`n$modelFull")
}
if ($MaximumFileBytes -gt 0 -and $modelSize -gt $MaximumFileBytes) {
  Fail ("ERROR: Source file is not a valid supported GGUF model " +
    "(size $modelSize bytes exceeds the $MaximumFileBytes-byte maximum):`n$modelFull")
}

$manifestMatch = $false
if ($appManifest -and $appManifest.filename -and
    $modelName.Equals($appManifest.filename, [System.StringComparison]::OrdinalIgnoreCase)) {
  $manifestMatch = $true
}
elseif ($appManifest -and $appManifest.filename) {
  Write-Warning ("Model filename '$modelName' does not match the application manifest " +
    "'$($appManifest.filename)'. The package is still created; import it only into a compatible application version.")
}

if ([string]::IsNullOrWhiteSpace($ModelFamily) -and $manifestMatch -and $appManifest.family) {
  $ModelFamily = $appManifest.family
}
if ([string]::IsNullOrWhiteSpace($Quantization) -and $manifestMatch -and $appManifest.quantization) {
  $Quantization = $appManifest.quantization
}
if ([string]::IsNullOrWhiteSpace($RecommendedApplicationVersion)) {
  try {
    $packageJson = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw -Encoding UTF8 |
      ConvertFrom-Json
    $RecommendedApplicationVersion = $packageJson.version
  }
  catch {
    Write-Warning "Could not determine application version; omitting compatibility metadata."
  }
}

$extra = [ordered]@{}
if (-not [string]::IsNullOrWhiteSpace($ModelFamily)) { $extra['modelFamily'] = $ModelFamily }
if (-not [string]::IsNullOrWhiteSpace($ModelSizeLabel)) { $extra['modelSize'] = $ModelSizeLabel }
if (-not [string]::IsNullOrWhiteSpace($Quantization)) { $extra['quantization'] = $Quantization }
if (-not [string]::IsNullOrWhiteSpace($RecommendedApplicationVersion)) {
  $extra['recommendedApplicationVersion'] = $RecommendedApplicationVersion
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $modelInfo.DirectoryName 'share'
}

$splitScript = Join-Path $PSScriptRoot 'split-release.ps1'
$arguments = @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Q $splitScript),
  '-InputFile', (Q $modelFull),
  '-ChunkSizeMB', "$ChunkSizeMB",
  '-OutputDirectory', (Q $OutputDirectory),
  '-PackageType', 'ai-model',
  '-ReassembleTemplateName', 'Reassemble-Model.template.ps1',
  '-ReassembleOutputName', 'Reassemble-Model.ps1'
)
if ($ChunkSizeBytes -gt 0) { $arguments += @('-ChunkSizeBytes', "$ChunkSizeBytes") }
if (-not [string]::IsNullOrWhiteSpace($OutputName)) { $arguments += @('-OutputName', (Q $OutputName)) }
if ($extra.Contains('modelFamily')) { $arguments += @('-ModelFamily', (Q $extra['modelFamily'])) }
if ($extra.Contains('modelSize')) { $arguments += @('-ModelSize', (Q $extra['modelSize'])) }
if ($extra.Contains('quantization')) { $arguments += @('-Quantization', (Q $extra['quantization'])) }
if ($extra.Contains('recommendedApplicationVersion')) {
  $arguments += @('-RecommendedApplicationVersion', (Q $extra['recommendedApplicationVersion']))
}
if ($Force) { $arguments += '-Force' }
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments `
  -NoNewWindow -Wait -PassThru
if ($process.ExitCode -ne 0) {
  Fail "ERROR: model splitting failed for $modelName (exit $($process.ExitCode))."
}
exit 0
