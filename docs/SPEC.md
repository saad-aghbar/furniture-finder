# Product Spec — Furniture Finder

## Who it's for
A furniture company (the owner's father and his staff). They keep product information —
names, codes, sizes, colours, prices, suppliers, stock — in many Excel files spread across
folders. They want to type a furniture name (in Hebrew, Arabic or English) anywhere on their
computer and instantly see the matching details, then copy them.

Users are not technical. Everything must be obvious, large, and calm.

## The core loop
1. Download installer from GitHub → install → app opens.
2. **First run:** a welcome screen asks them to add their files and folders.
3. App indexes everything (with a friendly animated progress screen).
4. The **floating search bar** appears. It stays on top of every window, always.
5. They type → results appear underneath the bar instantly → they click to copy.

---

## 1. First-run / onboarding window
A normal centred window (not the floating bar), ~720×520, rounded, animated.

**Step 1 — Language.** Three big buttons: العربية · עברית · English. Picks UI language
(changeable later). Auto-select from Windows locale, but still show the choice.

**Step 2 — Add your files.**
- A large drop zone: "Drag folders or Excel files here" + two buttons:
  **Add folder** and **Add files**.
- Drag-and-drop of any mix of folders and files is supported (multiple at once).
- Folders are scanned **recursively**.
- Accepted: `.xlsx .xlsm .xlsb .xls .csv .ods`. Other files inside folders are ignored
  silently (but counted: "Found 48 Excel files, skipped 12 other files").
- Skip temp/lock files: names starting with `~$`, hidden/system files.
- Each added source appears as a card (folder icon / file icon, name, path shortened,
  file count). Remove button (×) on each.

**Step 3 — Indexing.** Animated progress: current file name, files done / total, rows
indexed. Non-blocking: if it takes long they can press "Start searching now" and the bar
appears while indexing continues in the background (results fill in as files finish).
Files that fail (corrupt, password-protected) are listed at the end with a plain-language
reason and are not fatal.

**Step 4 — Done.** Short celebratory animation, a 3-tip mini tutorial
("Type to search", "Click a result to copy", "Use ⋯ to move the bar"), then the window
closes and the floating bar takes over.

Onboarding can be reopened any time from ⋯ → "Manage files".

## 2. The floating search bar (main UI)
A frameless, transparent, always-on-top window containing a pill-shaped search bar.

**Always on top:** stays above all normal windows, including full-screen Excel. Visible on
all virtual desktops. Never hidden by "show desktop" (re-assert on-top on focus/blur and
on a timer if Windows drops it). Does not appear in Alt-Tab and does not steal focus when
it appears. It may only be hidden if the user explicitly chooses "Hide" (and then a global
hotkey and the tray icon bring it back).

**Layout (LTR shown; mirrors in RTL):**
```
[ 🔍  Search furniture…                           [ Scope ▾ ]  [ ⋯ ] ]
```
- Left: search icon. Centre: input. Right: **Scope selector** button, then **⋯ menu**.
- Default size: ~560 px wide × 56 px tall; user can resize width by dragging bar edges
  (min 360, max 1000). Height grows downward for results.

**Input:**
- Accepts any language, any keyboard layout; mixed-language queries work.
- Text direction auto-detects per input (`dir="auto"`); placeholder in UI language.
- Search runs as you type (debounce ~120 ms). Enter jumps to first result.
- Esc clears; Esc again collapses results.
- Global hotkey **Ctrl+Shift+Space** focuses the bar from anywhere (configurable).

**Scope selector (the button on the right):**
- Opens an animated dropdown listing: **All files** (default), then every added folder
  (expandable tree) and every file under it, with a search box at the top to filter the list.
- Multi-select with checkboxes: e.g. search only "Prices 2026.xlsx" + "Suppliers" folder.
- Sheet-level: expanding a file shows its sheets; individual sheets can be chosen.
- The button label shows the current scope: "All files" / "Prices 2026.xlsx" /
  "3 files". A small coloured dot shows when scope is not "All".
- Scope persists between sessions.

**⋯ menu (three dots, far right):**
- **Move bar** — enters move mode: bar gets a dashed glow outline, cursor becomes a move
  cursor, drag anywhere (any monitor). Click or Enter to place; Esc to cancel. Also: the
  bar can always be dragged by its search icon / empty edges without the menu.
- **Snap positions:** top-centre, top-left, top-right, bottom-centre (quick buttons).
- **Manage files** — reopens the sources window (add/remove folders & files, re-index).
- **Re-index now**
- **Settings** (see §4)
- **Hide bar** (shows a note: "Press Ctrl+Shift+Space or click the tray icon to bring it back")
- **Quit**
- Position, width and monitor are remembered. If that monitor is gone on next launch,
  move it to the primary monitor's top-centre.

## 3. Search results
Results drop down **underneath the bar** in an animated panel (max height ~60% of screen,
scrolls inside).

**What is a result?** One matching **row** from a sheet. A row is shown as a card:
- **Title line:** the best "name-like" cell in that row (the column whose header looks like
  name / description / product / item — in any of the 3 languages — else the matched cell),
  with matched text highlighted.
- **Detail chips:** the other non-empty cells as `Header: value` pairs, using that sheet's
  header row (auto-detected; see ARCHITECTURE). Numbers and prices formatted as they appear
  in Excel (use the cell's formatted text `w`, not raw value). Show up to ~8 pairs, then
  "+5 more" which expands the card.
- **Source line (small, muted):** `File name › Sheet name › Row 42` + folder path on hover.
- Cards are grouped by file when the scope has several files (sticky file headers), sorted
  by relevance inside.

**Copy behaviour (very important — the main use):**
- Click a card → copies the **whole row** in a paste-friendly format and shows an animated
  "Copied ✓" toast on the card.
  - Clipboard gets both **TSV** (pastes into Excel as cells, headers optional per setting)
    and **plain text** `Header: value` lines (pastes nicely into WhatsApp/email) — write
    both `text/plain` and HTML table to the clipboard so each app picks the best one.
- Click a single chip → copies just that value.
- Each card has small actions on hover: **Copy row**, **Copy with headers**,
  **Open in Excel** (opens the file; if possible selects the row via a temp `.xlsx`-free
  approach such as launching Excel with the file and using COM automation from a
  PowerShell helper to activate sheet + row — if that fails, just open the file).
- Keyboard: ↑/↓ move between cards, Enter = copy row, Ctrl+C = copy row,
  Ctrl+Enter = open in Excel.
- Text inside cards is also normally selectable for manual copy.

**Empty / edge states:**
- No query: panel collapsed (or shows "Recent searches" if setting on).
- No results: friendly message + suggestion ("Try fewer words" / "Searching only in
  Prices 2026.xlsx — search all files?" with a button that switches scope).
- Indexing still running: thin animated progress line along the bar's bottom edge and a
  note "Still reading 12 files…".
- Show result count and time: "128 results · 0.04 s".

**Matching rules (user-facing):** case-insensitive; ignores Arabic diacritics/tashkeel and
Hebrew niqqud; treats Arabic letter variants as the same (أ إ آ ا, ة/ه, ى/ي, ؤ/و, ئ/ي);
Hebrew final letters match their normal forms (ך/כ ם/מ ן/נ ף/פ ץ/צ); finds partial words
(typing "כורס" finds "כורסה", "كنب" finds "كنبة"); multiple words = all must match
(anywhere in the row); typos tolerated for words ≥ 4 letters when there are few exact
results; numbers/codes match exactly and as prefixes ("A-12" finds "A-1203").
Quotes `"..."` force an exact phrase.

## 4. Settings window
Small animated window, tabs: General · Search · Appearance · Files · About.
- **General:** UI language; start with Windows (default ON); global hotkey; show tray icon.
- **Search:** results per page (default 50); fuzzy matching on/off; copy includes headers
  on/off; recent searches on/off (stored locally, clearable).
- **Appearance:** Light / Dark / Follow Windows; text size (Normal / Large / Extra large —
  default Large); bar opacity when idle (60–100 %); reduce motion (Follow Windows / On / Off).
- **Files:** same as Manage files; auto-watch for changes (default ON); re-index button;
  list of files with errors and why.
- **About:** version, "Check for updates", link to GitHub page, open logs folder.

## 5. Keeping the index fresh
- Watch all added folders and files. New, changed, renamed or deleted Excel files update the
  index automatically within a few seconds (debounced; wait until file is no longer being
  written). Re-index only changed files (compare size + mtime + hash).
- On app start, do a quick change check of all sources in the background.
- If a source folder disappears (USB/network drive unplugged), keep its last index, mark it
  "offline" in Manage files, and keep searching it (show a small "offline" badge on results).

## 6. System integration
- Tray icon with menu: Show/Hide bar, Manage files, Settings, Quit.
- Single instance: launching again focuses the bar.
- Starts with Windows (per setting), launches straight into the bar (no onboarding after
  first run).
- Auto-updates from GitHub Releases quietly; shows a small "Update ready — restart" pill.

## 7. Languages
UI fully translated: Arabic (ar), Hebrew (he), English (en). All strings in
`src/renderer/i18n/{ar,he,en}.json`. RTL for ar/he: layout mirrors (search icon on the
right, ⋯ on the left), but numbers, codes and file paths stay LTR inside (use `<bdi>`).
Fonts: see DESIGN.md.

## 8. Out of scope for v1 (but keep code ready for)
Images embedded in Excel, searching PDFs/Word, cloud sync, multi-computer shared index,
editing data.
