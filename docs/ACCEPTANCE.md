# Acceptance Checklist

Legend: **[x]** verified by automated tests (unit + Playwright-Electron on macOS **and** on the packaged
Windows build in GitHub Actions) or by inspection of the release. **[ ] 🖥** implemented, but can only be
confirmed by a person on a real Windows PC (see "Manual Windows test" at the bottom).

## Install & start
- [ ] 🖥 Installer from GitHub Releases installs per-user without admin, in en/he/ar *(NSIS `perMachine: false`, 3 installer languages – built and published by CI)*
- [ ] 🖥 Desktop + Start menu shortcuts; app launches after install *(configured: `createDesktopShortcut`, `createStartMenuShortcut`, `runAfterFinish`)*
- [ ] 🖥 Starts with Windows (when enabled) straight into the bar; single instance *(login item + `requestSingleInstanceLock`)*

## Onboarding & indexing
- [x] Language choice works; whole UI switches incl. RTL mirroring
- [x] Drag-drop and buttons add folders and files; recursive; non-Excel skipped with count
- [x] Indexes .xlsx .xlsm .xlsb .xls .csv .ods; `~$` files ignored
- [x] Original files never modified (byte-for-byte unit test) — [ ] 🖥 works while a file is open in Excel *(read with shared access, temp-copy fallback)*
- [x] Corrupt/password files reported in plain language, not fatal
- [x] "Start searching now" works while indexing continues

## Floating bar
- [ ] 🖥 Always on top of all windows incl. maximised/full-screen Excel; survives Win+D *(top-most "screen-saver" level, re-asserted on blur and every 2 s)*
- [ ] 🖥 Never in Alt-Tab/taskbar; doesn't steal focus on start; clicks pass through transparent areas *(tool window, `showInactive`, `setIgnoreMouseEvents` – always-on-top and visibility verified in e2e)*
- [x] Move via ⋯ → Move bar, press-and-hold ⋯, snap positions; position remembered — [ ] 🖥 real-mouse dragging; monitor-unplug safe *(falls back to primary top-centre)*
- [x] Ctrl+Shift+Space registered and focuses the bar; Hide + bring back (hotkey/tray action) — [ ] 🖥 width drag with a real mouse

## Search
- [x] Hebrew, Arabic, English and mixed queries work; partial words; niqqud/tashkeel ignored
- [x] Arabic letter variants & Hebrew final letters match; Arabic-Indic digits match
- [x] Codes match exactly and by prefix; "quoted phrase" exact; typo tolerance kicks in
- [x] Scope: all / folder / file / sheet, multi-select, persists; label + dot indicator correct
- [x] Results show title, header:value chips, file › sheet › row; highlights correct in RTL
- [x] < 100 ms perceived latency on 500k rows *(every benchmark query < 30 ms; `npm run test:perf`)*

## Copy
- [x] Card click puts an HTML table row + "Header: value" text on the clipboard — [ ] 🖥 paste into real Excel / WhatsApp
- [x] Chip click copies single value; keyboard Enter/Ctrl+C copy; "Copied ✓" animation
- [ ] 🖥 Open in Excel opens the file (and row when possible) *(PowerShell COM, read-only, falls back to opening the file)*

## Freshness
- [x] Editing/adding/deleting/renaming a file updates results within ~5 s
- [x] Offline source keeps last index with badge

## Motion & design
- [x] Every row of the DESIGN.md motion table implemented and interruptible — [ ] 🖥 60 fps feel on the target PC
- [x] Reduced motion respected; dark/light/system themes; text size options; idle opacity
- [x] Looks right in all 3 languages (screenshots in README, also captured on the Windows CI runner)

## Quality
- [x] Unit + e2e tests pass in CI; no network calls except update check (CSP `default-src 'self'`, fonts bundled); logs written
- [x] Release workflow publishes installer + `.blockmap` + `latest.yml` (v1.0.0)
- [ ] Auto-update tested from v1.0.0 → v1.0.1 *(needs the repo to be public – GitHub only serves release files without a token for public repos)*

---

## Manual Windows test (10 minutes)

1. Download `Furniture-Finder-Setup-1.0.0.exe`, run it, click **More info → Run anyway**; confirm no admin prompt,
   shortcuts on the desktop and Start menu, the app opens at the end.
2. Onboarding in Hebrew or Arabic; add a real folder of Excel files; open one of those files in Excel **before**
   indexing finishes – it must still be read.
3. Open Excel full-screen (and press **Win+D**): the bar stays visible. Alt-Tab: the bar is not listed.
4. Search, click a card, paste into Excel (cells in one row) and into WhatsApp/Notepad (readable lines).
5. Hover a card → **Open in Excel**: the file opens at that row.
6. Press and hold ⋯ and drag the bar to the second monitor; restart the app – it is where you left it.
7. Edit a cell in Excel, save – search shows the new value within ~5 s.
8. Restart Windows – the bar appears by itself.
