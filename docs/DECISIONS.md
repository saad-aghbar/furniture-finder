# Decisions

Deviations from, or interpretations of, the spec. Newest at the bottom of each section.

## Tooling
- **Versions (Oct 2026):** Electron 44, electron-vite 6, Vite 8, React 19, Motion 14, TypeScript 6.0
  (typescript-eslint does not support TS 7 yet), Vitest 5, better-sqlite3 13, chokidar 5,
  electron-store 12, SheetJS 0.20.3 from the official CDN tarball.
- **Tests run on Electron's Node** (`ELECTRON_RUN_AS_NODE=1`, see `scripts/run-electron-node.mjs`).
  `postinstall` compiles better-sqlite3 for Electron's ABI; running Vitest on the system Node would
  need a second build. One binary for app + tests keeps macOS dev and Windows CI identical.
- **ESM-only deps** (chokidar, electron-store, zod) are bundled into the CJS main bundle instead of
  externalised, so the main process does not depend on `require(esm)`.
- Renderer-only packages (React, Motion, Lucide, fonts) are devDependencies: Vite bundles them, so
  they are not shipped twice inside the installer.

## Index & search
- **FTS5 external-content table** (`content='rows'`) instead of `content=''`. Search terms shorter than
  3 characters cannot use trigram matching and fall back to `LIKE` on the normalised text, which needs
  the text to be stored. Triggers keep `rows_fts` in sync.
- **Typo vocabulary:** a `vocab(token)` table of distinct normalised words (≥ 4 letters) instead of
  `row_tokens(token,row_id)`. Similar words are found in an in-memory copy of the vocabulary and then
  searched through FTS like normal terms, so we never need token→row links. Stale words after
  re-indexing are harmless (they just match nothing); the table is rebuilt with the index.
- **No bm25 ordering in SQL.** `ORDER BY rank` costs ~270 ms when a word matches all 500k rows.
  Candidates are streamed from FTS (`CROSS JOIN` forces FTS as the outer loop) up to 1,000 rows and
  ranked in JS with the rules from ARCHITECTURE.md. When the candidate set is capped we add rows
  whose product name *starts* with a search word (indexed `title_norm`), so exact names still surface.
  Measured on 500k rows (M-series Mac): 0.2–28 ms per query, including typo tolerance.
- **One transaction per file** when indexing (instead of 2,000-row batches). It is faster and searches
  never see a half-indexed file; progress events are still sent every 2,000 rows.
- **Codes never go through typo tolerance.** Terms containing digits (A-1203, prices) only match
  exactly or by prefix, otherwise "A-1203" would also return "A-1204".
- **Typo tolerance on word beginnings** only for terms ≥ 5 letters (4-letter prefixes produced noise).
- **Normalisation uses NFKD** (not NFKC) per character, then drops combining marks. This also strips
  Latin accents (café = cafe) and splits hamza seats/alef-madda into base letter + mark. Dropped marks
  are attached to the previous letter in the offset map so highlights cover the whole written letter.
- **Corrupt vs password:** only SheetJS errors mentioning "password" are reported as password-protected;
  everything else is "damaged or not a real Excel file".
- CSV encoding: UTF-8/UTF-16 first, otherwise whichever of Windows-1255 / Windows-1256 yields more
  Hebrew / Arabic letters.

## Main process & windows
- **The bar's native window is always "bar + results room"** (bar height + 8 px + up to 60 % of the
  screen). Transparent parts ignore the mouse (`setIgnoreMouseEvents(true,{forward:true})`), so the
  window never needs resizing while results animate – no clipping, no flicker. It is resized only
  when the bar is moved, its width is changed or the text size changes.
- **Results open upwards** when the bar is in the lower half of the screen (e.g. snapped to
  bottom-centre), otherwise downwards.
- **Windows acrylic material is not used**: it would blur the whole (mostly transparent) window
  rectangle. The glass look is CSS only, with a slightly more opaque background for readability.
- `type: 'toolbar'` on Windows (WS_EX_TOOLWINDOW) keeps the bar out of Alt-Tab and the taskbar;
  `type: 'panel'` on macOS lets it float over full-screen apps during development.
- Dragging, resizing and the snap "magnet" spring run in the main process from the cursor position
  (60 fps timer), so the bar follows the pointer 1:1 even across monitors. Snap ghost pills are drawn
  by a separate click-through overlay window.
- **Indexing runs in a `worker_threads` worker** that owns the only write connection; search runs on
  a read-only connection in main (WAL). Watch events are debounced (0.8 s, plus chokidar's
  write-finish wait of 1.2 s) → updates land within ~3 s.
- A vanished source *root* is treated as "offline" (unplugged drive), never as a deletion.
- "Open in Excel" only accepts files that are in the index, then uses Windows PowerShell 5.1 + COM
  (paths passed via environment variables, never interpolated into the script), falling back to
  `shell.openPath`.
- Electron 44's clipboard API is the async W3C style: one `ClipboardItem` carries `text/plain`
  ("Header: value" lines) and `text/html` (a one-row table Excel pastes as cells). A separate TSV
  flavour is not needed because Excel prefers the HTML table.
- Numbers in UI messages use Western digits in all three languages (the data uses them too).

## UI
- **Results panel height** is animated from the measured content height (one element, capped at the
  panel maximum) instead of Motion `layout` on the scroll container: scaling a scrolled list with
  sticky headers distorted the cards. Cards themselves use `layout="position"`.
- **Focus "width +16px"** is done by scaling only the glass background layer (`scaleX`), so the text
  never stretches and nothing re-lays-out per frame.
- **Menus use a solid surface**, not glass: a translucent menu over the results list was hard to read.
- **Selected options** (settings segmented controls) are a solid walnut pill with light text – the
  default "white pill on beige" was too subtle for older eyes.
- File names and paths are wrapped in `<bdi dir="ltr">`; otherwise a Hebrew/Arabic name followed by
  `.xlsx` is reordered by the bidi algorithm ("xlsx.קטלוג").
- Cards show three always-reachable actions (copy row, copy with titles, open in Excel); they fade in
  on hover / keyboard selection, and clicking anywhere on the card still copies the row.
- Hiding the bar first shows the "press Ctrl+Shift+Space…" note for ~2.5 s, then animates out.
- Renderer views are code-split (`?view=bar|onboarding|settings|overlay`) from one HTML entry.
- **Press and hold ⋯ to move the bar** (owner request): holding the ⋯ button for 350 ms, or starting
  to drag it, picks the bar up and it follows the pointer; a quick click still opens the menu. The
  onboarding tip and the button tooltip say so in all three languages.

## Packaging & release
- The release job packages the unpacked app first, runs the Playwright suite against the real
  `Furniture Finder.exe` (`FF_APP_EXE`), and only then builds the NSIS installer from that same
  folder (`--prepackaged`) and publishes it. A failing smoke test never publishes a release.
- chokidar / electron-store / zod are devDependencies because they are bundled into the main
  bundle; only better-sqlite3, electron-log, electron-updater and xlsx ship in `node_modules`.
  Windows builds keep only better-sqlite3's `win32-x64` prebuilt binary and en/he/ar Chromium locales.
- macOS builds (`npm run dist:mac`, dev only) are unsigned (`identity: null`).

## Hardening (code review)
- **"Open in Excel" opens the workbook read-only** (unless it is already open in Excel). The files
  often live in shared folders; a read-write open would lock them for colleagues. To edit, the user
  uses Excel's "Enable editing / Save as" as usual.
- A file that crashes the reader is marked damaged on the next start (status `indexing` survives a
  crash), and the worker restarts with back-off (max 5 times) – no crash loop.
- Queued indexing jobs are dropped when their file or source is removed.
- Closing the bar (Alt+F4) hides it; the tray and hotkey always bring it back.
- A new hotkey is registered before the old one is released; if it is taken, the old one stays.
- Source add/remove calls are serialised; Windows paths compare case-insensitively.
- A drag also ends when the pointer moves with no button pressed (release lost to another window).
