# Architecture — Furniture Finder

## Stack
| Concern | Choice | Why |
|---|---|---|
| Shell | Electron (latest stable) | True always-on-top frameless transparent windows, global hotkeys, tray, mature Windows installer + auto-update |
| Tooling | electron-vite + TypeScript (strict) | Fast dev on macOS, one config for main/preload/renderer |
| UI | React 19 + Motion (`motion/react`) | Spring/layout animations, AnimatePresence for results |
| Styling | CSS Modules or vanilla-extract + CSS variables for tokens | Theme + RTL via logical properties |
| Excel parsing | SheetJS `xlsx` (install from the official CDN tarball per SheetJS docs, not the stale npm version) | Reads xlsx/xlsm/xlsb/xls/csv/ods, gives formatted text |
| Index/store | `better-sqlite3` + FTS5 (trigram tokenizer) | Persistent, fast substring search in any script, survives restarts |
| Watching | `chokidar` v4 | Reliable on Windows incl. network drives (use polling fallback for UNC paths) |
| Fuzzy fallback | small Damerau-Levenshtein on candidate tokens | Typo tolerance without a big dependency |
| Settings | `electron-store` | Simple JSON settings |
| Packaging | `electron-builder` NSIS, x64 | Standard per-user installer, no admin needed |
| Updates | `electron-updater` with GitHub provider | Free via GitHub Releases |
| Tests | Vitest (unit), Playwright `_electron` (e2e) | |
| Logging | `electron-log` | Logs to `%APPDATA%/Furniture Finder/logs` |

## Processes
```
Main process
 ├─ WindowManager  (bar window, onboarding/sources window, settings window)
 ├─ TrayManager, HotkeyManager, AutoLaunch, Updater
 ├─ SourceManager  (added folders/files, chokidar watchers, change detection)
 └─ IndexerHost    (spawns & talks to the indexing worker)
Utility process / worker_threads: Indexer
 ├─ parse files with SheetJS, detect headers, normalise, write to SQLite
Search runs in the main process on a read-only SQLite connection (fast, sync, <20 ms).
Renderer(s): React apps, talk to main ONLY through a typed preload bridge (contextIsolation on,
nodeIntegration off, sandbox on). No direct fs/sqlite in renderer.
```
Define all IPC channels in one `src/shared/ipc.ts` with typed request/response; validate input
with zod in main.

## Windows (Electron BrowserWindow settings)
**Bar window:** `frame:false, transparent:true, resizable:false (custom edge-resize), skipTaskbar:true,
alwaysOnTop:true` then `setAlwaysOnTop(true,'screen-saver')`, `setVisibleOnAllWorkspaces(true)`,
`focusable:true`, `hasShadow:false` (shadow drawn in CSS), `backgroundColor:'#00000000'`.
Window is sized to bar + current results height; animate content in CSS, and resize the
window **before** expanding (grow) / **after** collapsing (shrink) so animations never clip.
Use `setIgnoreMouseEvents(true,{forward:true})` on transparent areas so clicks pass through to
apps underneath; toggle off when cursor is over the bar/results (renderer reports hover).
Re-assert top-most on `blur`, on display changes, and every ~2 s via a cheap check.
Use `showInactive()` on startup so it doesn't steal focus.
Dragging: implement custom drag (pointer events → IPC → `setPosition`) so it works in move mode
and with RTL; clamp to the work area of whichever display the cursor is on.

## Data model (SQLite at `%APPDATA%/Furniture Finder/index.db`, WAL mode)
```sql
sources(id INTEGER PK, kind TEXT CHECK(kind IN('folder','file')), path TEXT UNIQUE,
        added_at INTEGER, status TEXT)            -- status: ok | offline | error
files(id INTEGER PK, source_id INT, path TEXT UNIQUE, name TEXT, size INT, mtime INT,
      hash TEXT, indexed_at INT, status TEXT, error TEXT)
sheets(id INTEGER PK, file_id INT, name TEXT, idx INT, header_row INT, headers_json TEXT,
       name_col INT)
rows(id INTEGER PK, sheet_id INT, row_num INT, cells_json TEXT,  -- formatted strings, by column
     display_title TEXT)
rows_fts USING fts5(norm_text, content='', tokenize='trigram')    -- rowid = rows.id
row_tokens(token TEXT, row_id INT)  -- distinct normalised tokens ≥4 chars, for fuzzy fallback
meta(key TEXT PK, value TEXT)       -- schema_version, normaliser_version
```
On normaliser_version change, rebuild the index automatically.
Re-indexing a file = delete its sheets/rows (cascade) in one transaction, insert new.

## Parsing & header detection
- Read with `XLSX.readFile(path, {cellText:true, cellDates:true, dense:true})` from a temp copy
  if the original is locked. Skip hidden "veryHidden" sheets? — No: index all sheets, but mark hidden.
- Use formatted text (`cell.w`) for display; fall back to `String(cell.v)`.
- Merged cells: propagate merged value to the covered cells for header rows only.
- **Header row detection:** within the first 15 rows, pick the row with the most non-empty text
  (non-numeric) cells that is followed by rows with consistent column fill. If none, headers =
  column letters (A, B, C…).
- **Name column:** header matches (normalised) any of: name, item, product, description, model,
  title, שם, מוצר, תיאור, דגם, פריט, اسم, الاسم, منتج, وصف, صنف, موديل, البيان. Else the
  first column with mostly text. Store per sheet.
- Skip fully empty rows; skip rows that are a repeat of the header row.
- Large files: stream sheet by sheet, insert in batched transactions of 2,000 rows; report
  progress events (file, sheet, rows) to main every ~200 ms.
- Corrupt / password-protected → status=error with a friendly message key.

## Search
### Normalisation (`src/shared/normalize.ts`, used for BOTH indexing and queries; unit-tested heavily)
1. Unicode NFKC, lower-case (locale-independent).
2. Strip: Arabic tashkeel (U+064B–U+065F, U+0670), tatweel U+0640; Hebrew niqqud & cantillation
   (U+0591–U+05C7 except letters); bidi control chars; zero-width chars.
3. Arabic folding: أ إ آ ٱ → ا ; ة → ه ; ى → ي ; ؤ → و ; ئ → ي ; Persian/Urdu ک → ك, ی → ي.
4. Hebrew folding: ך→כ ם→מ ן→נ ף→פ ץ→צ ; geresh/gershayim ׳ ״ and ' " removed inside words.
5. Digits: Arabic-Indic ٠-٩ and Persian ۰-۹ → 0-9.
6. Punctuation & separators → space, but keep `-` `/` `.` inside codes (e.g. A-12/3) and also
   index the code with separators removed (A123).
7. Collapse whitespace.
Bump `NORMALIZER_VERSION` whenever this changes.

### Query pipeline
1. Normalise query; parse `"exact phrases"`; split into terms.
2. Terms ≥ 3 chars → FTS5 trigram MATCH (AND of terms). Terms of 1–2 chars → `LIKE` filter on the
   candidate set (trigram can't match < 3 chars).
3. Apply scope (file ids / sheet ids) via JOIN filter.
4. Rank (in JS on top ~500 candidates): exact cell match > match in name column > word-start
   match > substring; bonus for all terms in the same cell; small bonus for recently copied rows.
   Use bm25 as a tiebreaker.
5. If < 5 results and fuzzy is on: for each term ≥ 4 chars, find tokens within edit distance 1
   (≤ 7 chars) or 2 (longer) from `row_tokens`, re-run, mark results "similar".
6. Return results with highlight ranges computed against the **original** cell text (map
   normalised offsets back to original; keep an offset map in normalize()).
Target: < 50 ms for 500k rows on a mid-range laptop. Cancel stale queries (sequence numbers).

## Folder layout
```
src/
  main/        index.ts, windows/, tray.ts, hotkeys.ts, updater.ts, sources/, search/, ipc/
  indexer/     worker.ts, parse.ts, headers.ts, db.ts
  preload/     index.ts (typed bridge)
  renderer/
    bar/       SearchBar, ScopePicker, OverflowMenu, Results, ResultCard, Toast
    onboarding/ settings/ shared components, i18n/, theme/, motion/ (shared variants)
  shared/      ipc.ts, normalize.ts, types.ts, constants.ts
build/         icon.ico, installer assets, installer.nsh (optional)
tests/         unit/, e2e/, fixtures/ (sample xlsx in he/ar/en, csv, xls, corrupt, password)
docs/
```

## Security
contextIsolation + sandbox + no nodeIntegration; strict CSP; open external links only to
github.com via `shell.openExternal` allowlist; never `eval`; validate all IPC.
