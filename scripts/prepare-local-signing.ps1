param(
  [Parameter(Mandatory = $true)]
  [string]$CertificateOutput,
  [Parameter(Mandatory = $true)]
  [string]$MetadataOutput
)

$ErrorActionPreference = 'Stop'
$subject = 'CN=DeepDive Local Use'
$friendlyName = 'DeepDive Local Use Code Signing'
$minimumValidity = (Get-Date).AddDays(30)

$certificate = @(
  Get-ChildItem -LiteralPath 'Cert:\CurrentUser\My' -CodeSigningCert |
    Where-Object {
      $_.Subject -eq $subject -and
      $_.HasPrivateKey -and
      $_.NotAfter -gt $minimumValidity
    } |
    Sort-Object NotAfter -Descending
) | Select-Object -First 1

$created = $false
if (-not $certificate) {
  $certificate = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $subject `
    -FriendlyName $friendlyName `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy NonExportable `
    -NotAfter (Get-Date).AddYears(5)
  $created = $true
}

$certificatePath = [System.IO.Path]::GetFullPath($CertificateOutput)
$metadataPath = [System.IO.Path]::GetFullPath($MetadataOutput)
$outputDirectory = Split-Path -Parent $certificatePath
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null

Write-Output 'Trusting the public local-use certificate for the current Windows user.'
$publicCertificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certificatePath)
foreach ($storeName in @('Root', 'TrustedPublisher')) {
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store(
    $storeName,
    [System.Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
  )
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
    if (-not ($store.Certificates | Where-Object Thumbprint -eq $certificate.Thumbprint)) {
      $store.Add($publicCertificate)
    }
  } finally {
    $store.Close()
  }
}

$instructionsPath = Join-Path $outputDirectory 'LOCAL-CERTIFICATE-INSTALL.txt'
$instructions = @"
DeepDive local-use certificate

This public certificate contains no private signing key. Keep the private key on the build
computer. On each personal Windows account that will run DeepDive, open PowerShell in this
directory and explicitly trust the certificate with:

Import-Certificate -FilePath '.\DeepDive-Local.cer' -CertStoreLocation 'Cert:\CurrentUser\Root'
Import-Certificate -FilePath '.\DeepDive-Local.cer' -CertStoreLocation 'Cert:\CurrentUser\TrustedPublisher'

Certificate thumbprint: $($certificate.Thumbprint)
Certificate expires: $($certificate.NotAfter.ToString('u'))

Do not install this certificate on machines you do not control. These builds are for private use
only and are not publicly trusted.
"@
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($instructionsPath, $instructions, $utf8WithoutBom)

$metadata = @{
  thumbprint = $certificate.Thumbprint
  subject = $certificate.Subject
  created = $created
  expires = $certificate.NotAfter.ToString('o')
} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText($metadataPath, $metadata, $utf8WithoutBom)

$certificateAction = if ($created) { 'created' } else { 'reused' }
Write-Output "Local signing certificate ${certificateAction}: $($certificate.Thumbprint)"
