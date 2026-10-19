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
