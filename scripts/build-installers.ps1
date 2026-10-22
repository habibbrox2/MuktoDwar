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
  [string]$OutputDir = 'build/installer',
  [string]$WixBin = '',
  [string]$Iscc = ''
)

$ErrorActionPreference = 'Stop'

# The repository root is the folder that holds the installer sources.
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-RepoPath([string]$Path) {
  if ([System.IO.Path]::IsPathRooted($Path)) { return [System.IO.Path]::GetFullPath($Path) }
  return [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $Path))
}

function Get-RepoRelativePath([string]$FullPath) {
  $full = [System.IO.Path]::GetFullPath($FullPath)
  if ($full.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($RepoRoot.Length).TrimStart('\', '/') -replace '\\', '/'
  }
  return ($full -replace '\\', '/')
}

function Find-FirstFile([string[]]$Patterns) {
  foreach ($pattern in $Patterns) {
    $match = Get-ChildItem $pattern -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) { return $match.FullName }
  }
  return $null
}

# Absolute paths keep the build independent of the current directory.
$AppDir = Resolve-RepoPath $AppDir
$OutputDir = Resolve-RepoPath $OutputDir
$WorkDir = Resolve-RepoPath 'build'
$Harvested = Resolve-RepoPath 'installer/harvested.wxs'
$Package = Resolve-RepoPath 'installer/muktodwar.wxs'
$InnoScript = Resolve-RepoPath 'installer/muktodwar.iss'
$VerifyScript = Resolve-RepoPath 'scripts/verify-msi.mjs'

if (-not (Test-Path $AppDir)) { throw "The application folder '$AppDir' does not exist. Build the app first." }
if (-not (Test-Path $Package)) { throw "The WiX source '$Package' was not found." }
if (-not (Test-Path $InnoScript)) { throw "The Inno Setup script '$InnoScript' was not found." }

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

# The WiX tools resolve relative source paths against the current directory,
# so the build always runs from the repository root.
$AppRel = Get-RepoRelativePath $AppDir
$OutputRel = Get-RepoRelativePath $OutputDir
Push-Location $RepoRoot
try {

# --- Inno Setup (EXE installer) ---------------------------------------------
if (-not $Iscc) {
  $Iscc = Find-FirstFile @(
    'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
    'C:\Program Files\Inno Setup 6\ISCC.exe',
    'C:\Program Files*\Inno Setup*\ISCC.exe'
  )
}
if (-not $Iscc) {
  throw 'Inno Setup (ISCC.exe) was not found. Install it with: choco install innosetup -y'
}

Write-Host "==> Inno Setup: $Iscc"
& $Iscc $InnoScript
if ($LASTEXITCODE -ne 0) { throw 'Inno Setup build failed.' }

# --- WiX Toolset (MSI package) ---------------------------------------------
if (-not $WixBin) {
  $WixBin = (Get-ChildItem 'C:\Program Files*\WiX Toolset*\bin' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
}
if (-not $WixBin -or -not (Test-Path (Join-Path $WixBin 'light.exe'))) {
  throw 'WiX Toolset was not found. Install it with: choco install wixtoolset -y'
}
$env:Path = $WixBin + ';' + $env:Path

Write-Host "==> WiX Toolset: $WixBin"

# Harvest the application folder into a component group.
#
# The transform marks every harvested component as a 64-bit component
# (the package is built for x64, and Windows Installer decides from the
# component which view of the registry it writes to) and leaves the
# executable to the package, which declares it together with the
# shortcuts that point at it.
#
# -ag instead of -gg: the component ids are then derived from the file
# they hold, so they stay the same from one build to the next and an
# upgrade replaces only what changed.
heat dir $AppRel -cg ProductComponents -ag -scom -sreg -sfrag -srd -dr INSTALLFOLDER -var var.SourceDir -t installer/heat-transform.xslt -out installer/harvested.wxs
if ($LASTEXITCODE -ne 0) { throw 'WiX harvest failed.' }

# Compile the authored package together with the harvested components.
candle "-dSourceDir=$AppRel" installer/muktodwar.wxs installer/harvested.wxs -out build/
if ($LASTEXITCODE -ne 0) { throw 'WiX compilation failed.' }

# Link the MSI. The cabinet is embedded, so the .msi is self-contained.
light build/muktodwar.wixobj build/harvested.wixobj -out "$OutputRel/MuktoDwar.msi"
if ($LASTEXITCODE -ne 0) { throw 'WiX linking failed.' }

}
finally {
  Pop-Location
}

# Guard against an MSI that references a loose .cab file next to it.
node $VerifyScript "$OutputDir/MuktoDwar.msi"
if ($LASTEXITCODE -ne 0) { throw 'The generated MSI failed verification.' }

Write-Host '==> Installers ready:'
Get-ChildItem $OutputDir -Include '*.exe', '*.msi' -File -Recurse | ForEach-Object {
  Write-Host ("    {0} ({1:N1} MB)" -f $_.Name, ($_.Length / 1MB))
}
