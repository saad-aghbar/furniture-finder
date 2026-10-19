# Acceptance Checklist

## Install & start
- [ ] Installer from GitHub Releases installs per-user without admin, in en/he/ar
- [ ] Desktop + Start menu shortcuts; app launches after install
- [ ] Starts with Windows (when enabled) straight into the bar; single instance

## Onboarding & indexing
- [ ] Language choice works; whole UI switches incl. RTL mirroring
- [ ] Drag-drop and buttons add folders and files; recursive; non-Excel skipped with count
- [ ] Indexes .xlsx .xlsm .xlsb .xls .csv .ods; `~$` files ignored
- [ ] Works while a file is open in Excel; original files never modified
- [ ] Corrupt/password files reported in plain language, not fatal
- [ ] "Start searching now" works while indexing continues

## Floating bar
- [ ] Always on top of all windows incl. maximised/full-screen Excel; survives Win+D
- [ ] Never in Alt-Tab/taskbar; doesn't steal focus on start; clicks pass through transparent areas
- [ ] Move via ⋯ → Move bar, and by dragging; snap positions; position remembered; monitor-unplug safe
- [ ] Width resizable; Ctrl+Shift+Space focuses it; Hide + bring back via hotkey/tray

## Search
- [ ] Hebrew, Arabic, English and mixed queries work; partial words; niqqud/tashkeel ignored
- [ ] Arabic letter variants & Hebrew final letters match; Arabic-Indic digits match
- [ ] Codes match exactly and by prefix; "quoted phrase" exact; typo tolerance kicks in
- [ ] Scope: all / folder / file / sheet, multi-select, persists; label + dot indicator correct
- [ ] Results show title, header:value chips, file › sheet › row; highlights correct in RTL
- [ ] < 100 ms perceived latency on 500k rows

## Copy
- [ ] Click card → paste into Excel gives cells in a row; into WhatsApp/Notepad gives readable lines
- [ ] Chip click copies single value; keyboard Enter/Ctrl+C copy; "Copied ✓" animation
- [ ] Open in Excel opens the file (and row when possible)

## Freshness
- [ ] Editing/adding/deleting/renaming a file updates results within ~5 s
- [ ] Offline source keeps last index with badge

## Motion & design
- [ ] Every row of the DESIGN.md motion table implemented, 60 fps, interruptible
- [ ] Reduced motion respected; dark/light/system themes; text size options; idle opacity
- [ ] Looks right in all 3 languages (screenshots in README)

## Quality
- [ ] Unit + e2e tests pass in CI; no network calls except update check; logs written
- [ ] Release workflow publishes installer + latest.yml; auto-update tested from v1.0.0 → v1.0.1
