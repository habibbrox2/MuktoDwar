#Requires -Version 5.1
# DPAPI (CurrentUser) batch codec for the Local AI Gateway.
# Protocol: stdin  = {"ops":[{"id":"..","mode":"protect|unprotect","value":".."}]}
#           stdout = {"results":[{"id":"..","ok":true,"value":".."},{"id":"..","ok":false,"error":"CODE"}]}
# Secrets travel over stdin/stdout only. They are never placed in argv, and the
# error codes are fixed strings so a failure can never echo secret material.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding  = $utf8
[Console]::OutputEncoding = $utf8

try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch {
  [Console]::Out.Write('{"fatal":"DPAPI_ASSEMBLY_UNAVAILABLE"}')
  exit 0
}

$scope   = [System.Security.Cryptography.DataProtectionScope]::CurrentUser
$entropy = [System.Text.Encoding]::UTF8.GetBytes('LocalAIGateway/v1/secrets')

$raw = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($raw)) {
  [Console]::Out.Write('{"fatal":"EMPTY_REQUEST"}')
  exit 0
}

try { $req = $raw | ConvertFrom-Json -ErrorAction Stop } catch {
  [Console]::Out.Write('{"fatal":"INVALID_REQUEST"}')
  exit 0
}

$ops = $req.ops
if ($null -eq $ops) {
  [Console]::Out.Write('{"fatal":"INVALID_REQUEST"}')
  exit 0
}

$results = @()
foreach ($op in $ops) {
  $id   = [string]$op.id
  $mode = [string]$op.mode
  try {
    if ($mode -eq 'protect') {
      $bytes = $utf8.GetBytes([string]$op.value)
      $blob  = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $entropy, $scope)
      $results += @{ id = $id; ok = $true; value = [Convert]::ToBase64String($blob) }
    } elseif ($mode -eq 'unprotect') {
      $blob  = [Convert]::FromBase64String([string]$op.value)
      $bytes = [System.Security.Cryptography.ProtectedData]::Unprotect($blob, $entropy, $scope)
      $results += @{ id = $id; ok = $true; value = $utf8.GetString($bytes) }
    } else {
      $results += @{ id = $id; ok = $false; error = 'UNSUPPORTED_MODE' }
    }
  } catch {
    $results += @{ id = $id; ok = $false; error = 'DPAPI_OPERATION_FAILED' }
  }
}

$payload = @{ results = $results } | ConvertTo-Json -Compress -Depth 6
[Console]::Out.Write($payload)
exit 0
