# Windows Build, Release & Deployment — A to Z Guide

This guide covers the full lifecycle for building MuktoDwar as a Windows application, publishing releases, and deploying to end users.

## 1. Prerequisites

- Node.js >= 22.12 (for SEA build).
- npm ci dependencies installed.
- (Local installer build) Inno Setup 6 — `choco install innosetup -y`.
- (Local MSI build) WiX Toolset v3 — `choco install wixtoolset -y`.

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

## 4. Build the installers (one script, two packages)

Both installers come from the **same** application build and follow the **same**
installation policy:

| Topic                | Decision                                          |
| -------------------- | ------------------------------------------------- |
| Primary installer    | `MuktoDwar-Setup.exe` (Inno Setup)                |
| Alternative package  | `MuktoDwar.msi` (WiX) — for IT / managed rollout  |
| Application version  | `1.0.0` in both                                   |
| Install location     | `C:\Program Files\MuktoDwar` in both              |
| Start Menu shortcut  | `MuktoDwar` in both                               |
| Uninstall            | Each package manages itself; both register an entry in Add/Remove Programs |
| User settings & keys | Kept on upgrade and on uninstall (state lives in `%LOCALAPPDATA%\LocalAIGateway`, outside the install directory) |
| Release              | Both are published as assets of the same release   |

Assemble the app folder, then build both packages with one command:

```powershell
npm run build
npm run build:sea
# copy build/muktodwar.exe, src/ui, assets, scripts and dist into build/app
pwsh -File scripts/build-installers.ps1
```

The script locates Inno Setup and the WiX Toolset, builds
`build/installer/MuktoDwar-Setup.exe` and `build/installer/MuktoDwar.msi`, and
verifies that the MSI carries an embedded cabinet (a loose `.cab` next to the
`.msi` would break managed deployment).

Build them by hand if you prefer:

```powershell
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer/muktodwar.iss
heat dir build/app -cg ProductComponents -gg -scom -sreg -sfrag -srd -dr INSTALLFOLDER -var var.SourceDir -out installer/harvested.wxs
candle -dSourceDir=build/app installer/muktodwar.wxs installer/harvested.wxs -out build/
light build/muktodwar.wixobj build/harvested.wixobj -out build/installer/MuktoDwar.msi
node scripts/verify-msi.mjs build/installer/MuktoDwar.msi
```

## 6. GitHub Actions (automatic)

Workflow: `.github/workflows/release.yml`

Triggers:
- Push to `main` branch.
- Push of a version tag `v*` (e.g. `v1.0.0`).
- Manual `workflow_dispatch`.

Steps performed on `windows-latest`:
1. Checkout + setup Node 26.
2. `npm ci` and `npm run verify`.
3. `npm run build:sea` -> `build/muktodwar.exe` (GUI subsystem: no console window).
4. Assemble `build/app/` (exe + ui + assets + dist).
5. Inno Setup -> `build/installer/MuktoDwar-Setup.exe`.
6. WiX heat/candle/light -> `build/installer/MuktoDwar.msi`.
7. Upload artifacts.
8. Compute release tag (`v*` tag name, or `build-<run_number>` for branch pushes).
9. Create GitHub Release with assets: `muktodwar.exe`, `MuktoDwar-Setup.exe`, `MuktoDwar.msi`.

Both installers are produced from the **same** application build and share the
same version, install location, Start Menu shortcut and uninstall policy. The
Inno Setup `.exe` is the recommended installer for end users; the WiX `.msi` is
the equivalent package for IT / managed deployment.

## 6b. Test build without publishing (manual)

Workflow: `.github/workflows/windows-test-build.yml`

Triggers only on `workflow_dispatch` (Actions -> "Windows Test Build" -> Run
workflow). It runs the same build and both installer steps, then uploads
`muktodwar.exe`, the Inno Setup installer and the `.msi` as GitHub Actions
artifacts (7-day retention). It never creates a Release, a version tag, or a
production deployment, so it can be run freely for testing.

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
4. The gateway starts on `http://127.0.0.1:8787` and opens the admin dashboard as a standalone window.
5. On first run, use the administrator token shown on the login gate until it is rotated.

## 11. Secrets / config location

Installed app stores config and DPAPI-encrypted secrets under `%LOCALAPPDATA%\LocalAIGateway\`, and logs under `%LOCALAPPDATA%\MuktoDwar\logs\`. Uninstalling does not remove user data by default, so an upgrade keeps settings and API keys.

## 12. Troubleshooting

- If the exe fails to find the UI, ensure `ui/` and `assets/` folders sit next to `muktodwar.exe`.
- For MSI install failures, check Windows Event Viewer -> Application log.
- Re-run `npm run verify` locally before tagging a release.