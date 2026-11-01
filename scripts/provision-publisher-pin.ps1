param(
  [string]$OutputPath = 'src/update/trusted-publisher.ts'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$output = Join-Path $repoRoot $OutputPath
$pfxBase64 = $env:WINDOWS_SIGNING_PFX_BASE64
$pfxPassword = $env:WINDOWS_SIGNING_PFX_PASSWORD
$expected = ($env:WINDOWS_SIGNING_CERT_THUMBPRINT -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
$hasPfx = -not [string]::IsNullOrWhiteSpace($pfxBase64)
$hasPassword = -not [string]::IsNullOrWhiteSpace($pfxPassword)
$hasExpected = -not [string]::IsNullOrWhiteSpace($expected)

if (($hasPfx -or $hasPassword -or $hasExpected) -and -not ($hasPfx -and $hasPassword -and $hasExpected)) {
  throw 'All three Windows signing secrets must be configured together; partial signing configuration is rejected.'
}

$pins = @()
if ($hasPfx) {
  if ($expected -notmatch '^[A-F0-9]{40}$') { throw 'WINDOWS_SIGNING_CERT_THUMBPRINT must be a 40-character SHA-1 thumbprint.' }
  $pfxPath = Join-Path $env:RUNNER_TEMP ('muktodwar-pin-' + [guid]::NewGuid().ToString('N') + '.pfx')
  $cert = $null
  try {
    $bytes = [Convert]::FromBase64String($pfxBase64)
    if ($bytes.Length -eq 0 -or $bytes.Length -gt 10485760) { throw 'Signing PFX size is invalid.' }
    [IO.File]::WriteAllBytes($pfxPath, $bytes)
    [Array]::Clear($bytes, 0, $bytes.Length)
    $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
      $pfxPath,
      $pfxPassword,
      [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    )
    if (-not $cert.HasPrivateKey) { throw 'Signing certificate has no private key.' }
    $actual = ($cert.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
    if ($actual -ne $expected) { throw 'PFX certificate does not match WINDOWS_SIGNING_CERT_THUMBPRINT.' }
    $pins = @($actual)
  }
  finally {
    if ($cert) { $cert.Dispose() }
    Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
    $pfxPassword = $null
    $pfxBase64 = $null
  }
}

$pinLiteral = ($pins | ForEach-Object { "'" + $_ + "'" }) -join ', '
$content = @"
/**
 * Generated before release verification/build.
 * Contains public certificate thumbprints only; never place PFX/key material here.
 * An unsigned build intentionally has no trusted publisher and fails closed.
 */
export const TRUSTED_PUBLISHER_THUMBPRINTS: readonly string[] = Object.freeze([$pinLiteral]);
export const PRIMARY_TRUSTED_PUBLISHER_THUMBPRINT: string | null =
  TRUSTED_PUBLISHER_THUMBPRINTS[0] ?? null;

export function normalizePublisherThumbprint(value: string): string {
  return value.replace(/[\\s:-]/g, "").toUpperCase();
}

export function isTrustedPublisherThumbprint(value: string): boolean {
  const normalized = normalizePublisherThumbprint(value);
  return /^[A-F0-9]{40}$/.test(normalized) &&
    TRUSTED_PUBLISHER_THUMBPRINTS.includes(normalized);
}
"@
[IO.Directory]::CreateDirectory((Split-Path -Parent $output)) | Out-Null
[IO.File]::WriteAllText($output, $content, [Text.UTF8Encoding]::new($false))
Write-Host ("Publisher pin provisioning complete. EmbeddedPins=" + $pins.Count)
