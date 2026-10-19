# Build & Release — Furniture Finder

## Scripts (package.json)
```
dev          electron-vite dev
build        electron-vite build
test         vitest run
test:e2e     playwright test
lint         eslint . && tsc --noEmit
dist:win     electron-vite build && electron-builder --win nsis --x64
postinstall  electron-builder install-app-deps   # rebuilds better-sqlite3 for Electron
```
Development happens on macOS: `npm run dev` must work there (always-on-top, tray etc. behave
close enough). The Windows installer is built **only in GitHub Actions** (native module
`better-sqlite3` must be compiled on Windows).

## electron-builder config (electron-builder.yml)
```yaml
appId: com.furniturefinder.app
productName: Furniture Finder
directories: { output: release, buildResources: build }
files: ["out/**", "package.json"]
asarUnpack: ["**/node_modules/better-sqlite3/**"]
win:
  target: [{ target: nsis, arch: [x64] }]
  icon: build/icon.ico
  artifactName: "Furniture-Finder-Setup-${version}.${ext}"
nsis:
  oneClick: false
  perMachine: false            # per-user install, no admin prompt
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: Furniture Finder
  installerLanguages: [en_US, he_IL, ar_SA]
  multiLanguageInstaller: true
  runAfterFinish: true
publish:
  provider: github
  owner: <GITHUB_USERNAME>     # fill from `gh api user -q .login`
  repo: furniture-finder
  releaseType: release
```

## GitHub Actions
`.github/workflows/ci.yml` — on push/PR: ubuntu → lint, typecheck, unit tests.

`.github/workflows/release.yml` — on tag `v*.*.*`:
- `runs-on: windows-latest`, Node 22 LTS, `npm ci`, `npm run test`,
  `npx electron-builder --win nsis --x64 --publish always`
- `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` with `permissions: contents: write`.
- Uploads the `.exe`, `.blockmap` and `latest.yml` to the GitHub Release (needed for auto-update).
- Run Playwright e2e on the Windows runner against the unpacked build as a smoke test.

Release flow: `npm version patch|minor` → `git push --follow-tags` → Actions builds and publishes.

## Code signing
Not required for v1. Unsigned installers trigger Windows SmartScreen ("Windows protected your
PC"). README must show the user: click **More info → Run anyway**. Leave a `win.signtoolOptions`
/ Azure Trusted Signing stub commented in config for later.

## Public vs private repo
- Repo is created **private** for development.
- GitHub Release downloads and `electron-updater` without a token only work for **public** repos.
  Before giving the link to the dad, the owner makes the repo public (ask first). Alternative if
  they want code private: a second public repo used only for releases (`publish.repo` points at it,
  workflow uses a PAT secret `RELEASES_TOKEN`). Document both options in README "For the developer".

## Auto-update
`autoUpdater.checkForUpdatesAndNotify()` 10 s after start and every 6 h; download in background;
show "Update ready — restart" pill in the bar; install on quit. Disabled in dev.

## README.md (create it) must contain
1. What it is, with an animated GIF/screenshot.
2. **Download & install** in English, العربية, עברית — big link to
   `https://github.com/<user>/furniture-finder/releases/latest`, the SmartScreen steps, and
   first-run steps (choose language → add folders → search).
3. How to use: search, scope button, ⋯ menu, copy, hotkey.
4. FAQ: "The bar disappeared" (Ctrl+Shift+Space / tray), "A file isn't found" (Manage files →
   errors list), "Does my data go online?" (No).
5. For the developer: dev setup, scripts, release flow, repo visibility.
