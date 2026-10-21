# Builds the two Windows installers from one application build.
#
#   * Inno Setup  -> build/installer/MuktoDwar-Setup.exe  (end users)
#   * WiX Toolset -> build/installer/MuktoDwar.msi         (managed deployment)
#
# Both packages contain the same application files, carry the same version,
# install into the same directory and follow the same uninstall policy.
#
# Prerequisites on the machine (see .github/workflows/release.yml):
#   choco install innosetup -y
#   choco install wixtoolset -y
#
# Usage: pwsh -File scripts/build-installers.ps1

param(
  [string]$AppDir = 'build/app',
  [string]$OutputDir = 'build/installer'
)

$ErrorActionPreference = 'Stop'

function Find-FirstFile([string[]]$Patterns) {
  foreach ($pattern in $Patterns) {
    $match = Get-ChildItem $pattern -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.FullName }
  }
  return $null
}

# --- Inno Setup (EXE installer) ---------------------------------------------
$iscc = Find-FirstFile @(
  'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
  'C:\Program Files\Inno Setup 6\ISCC.exe',
  'C:\Program Files*\Inno Setup*\ISCC.exe'
)
if (-not $iscc) {
  throw 'Inno Setup (ISCC.exe) was not found. Install it with: choco install innosetup -y'
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "==> Inno Setup: $iscc"
& $iscc 'installer/muktodwar.iss'
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup build failed.' }

# --- WiX Toolset (MSI package) ---------------------------------------------
$wixBin = (Get-ChildItem 'C:\Program Files*\WiX Toolset*\bin' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $wixBin) {
  throw 'WiX Toolset was not found. Install it with: choco install wixtoolset -y'
}
$env:Path = $wixBin.FullName + ';' + $env:Path

Write-Host "==> WiX Toolset: $($wixBin.FullName)"

# Harvest the application folder into a component group.
heat dir $AppDir -cg ProductComponents -gg -scom -sreg -sfrag -srd -dr INSTALLFOLDER -var var.SourceDir -out installer/harvested.wxs
if ($LASTEXITCODE -ne 0) { throw 'WiX harvest failed.' }

# Compile the authored package together with the harvested components.
candle -dSourceDir=$AppDir installer/muktodwar.wxs installer/harvested.wxs -out build/
if ($LASTEXITCODE -ne 0) { throw 'WiX compilation failed.' }

# Link the MSI. The cabinet is embedded, so the .msi is self-contained.
light build/muktodwar.wixobj build/harvested.wixobj -out "$OutputDir/MuktoDwar.msi"
if ($LASTEXITCODE -ne 0) { throw 'WiX linking failed.' }

# Guard against an MSI that references a loose .cab file next to it.
node scripts/verify-msi.mjs "$OutputDir/MuktoDwar.msi"
if ($LASTEXITCODE -ne 0) { throw 'The generated MSI failed verification.' }

Write-Host '==> Installers ready:'
Get-ChildItem $OutputDir -Include '*.exe', '*.msi' -File -Recurse | ForEach-Object {
  Write-Host ("    {0} ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB))
}
