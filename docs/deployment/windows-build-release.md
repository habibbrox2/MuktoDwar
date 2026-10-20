# Windows Build, Release & Deployment — A to Z Guide

This guide covers the full lifecycle for building MuktoDwar as a Windows application, publishing releases, and deploying to end users.

## 1. Prerequisites

- Node.js >= 22.12 (for SEA build).
- npm ci dependencies installed.
- (Local MSI build) WiX Toolset v3.11 on PATH.
- (Local installer build) Inno Setup 6 on PATH.

## 2. Local development

```powershell
npm ci
npm run verify        # typecheck + tests + build
npm start             # runs gateway on 127.0.0.1:8787, opens browser
```

On first run the administrator token is printed once in the console.

## 3. Build the Windows executable (SEA)

```powershell
npm run build         # compile TS -> dist/
npm run build:sea     # produce build/muktodwar.exe
```

The SEA build copies the Node binary, injects the compiled app blob, and writes `build/muktodwar.exe`. Test it:

```powershell
build\muktodwar.exe
```

## 4. Build installer (Inno Setup)

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer/muktodwar.iss
```

Output: `build/installer/MuktoDwar-Setup.exe`.

## 5. Build MSI (WiX)

Assemble the app folder first, then:

```powershell
heat dir build/app -cg ProductComponents -gg -scom -sreg -sfrag -srd -dr INSTALLFOLDER -var var.SourceDir -out installer/harvested.wxs
candle -dSourceDir=build/app installer/muktodwar.wxs installer/harvested.wxs -out build/
light build/muktodwar.wixobj build/harvested.wixobj -out build/installer/MuktoDwar.msi
```

Output: `build/installer/MuktoDwar.msi`.

## 6. GitHub Actions (automatic)

Workflow: `.github/workflows/release.yml`

Triggers:
- Push to `main` branch.
- Push of a version tag `v*` (e.g. `v1.0.0`).
- Manual `workflow_dispatch`.

Steps performed on `windows-latest`:
1. Checkout + setup Node 22.
2. `npm ci` and `npm run verify`.
3. `npm run build:sea` -> `build/muktodwar.exe`.
4. Assemble `build/app/` (exe + ui + assets + dist).
5. Inno Setup -> `build/installer/MuktoDwar-Setup.exe`.
6. WiX heat/candle/light -> `build/installer/MuktoDwar.msi`.
7. Upload artifacts.
8. Compute release tag (`v*` tag name, or `build-<run_number>` for branch pushes).
9. Create GitHub Release with assets: `muktodwar.exe`, `MuktoDwar-Setup.exe`, `MuktoDwar.msi`.

## 7. Create a versioned release (tag)

```powershell
git tag v1.0.0
git push origin v1.0.0
```

This triggers the workflow and publishes release `v1.0.0` with all assets.

## 8. Auto-build on every push

Every push to `main` automatically builds and publishes a release tagged `build-<run_number>`. No manual steps needed.

## 9. Download links

- Latest release: https://github.com/habibbrox2/MuktoDwar/releases/latest
- All releases: https://github.com/habibbrox2/MuktoDwar/releases
- Assets per release:
  - `muktodwar.exe` — single-file executable
  - `MuktoDwar-Setup.exe` — Inno Setup installer
  - `MuktoDwar.msi` — Windows Installer package

## 10. Deployment to end users

1. Download the installer (`.exe` or `.msi`) from the Releases page.
2. Run the installer; it installs to `C:\Program Files\MuktoDwar\`.
3. Launch MuktoDwar from the Start Menu / desktop shortcut.
4. The gateway starts on `http://127.0.0.1:8787` and opens the admin dashboard in the browser.
5. On first run, use the administrator token printed in the console (or displayed on the login page until rotated).

## 11. Secrets / config location

Installed app stores config and DPAPI-encrypted secrets under `%LOCALAPPDATA%\MuktoDwar\`. Uninstalling does not remove user data by default.

## 12. Troubleshooting

- If the exe fails to find the UI, ensure `ui/` and `assets/` folders sit next to `muktodwar.exe`.
- For MSI install failures, check Windows Event Viewer -> Application log.
- Re-run `npm run verify` locally before tagging a release.