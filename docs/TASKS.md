# Build Plan — work top to bottom, commit + push after each phase

## Phase 0 — Repo & scaffold
- [x] Step 0 from CLAUDE.md (git init, .gitignore, private GitHub repo, push)
- [x] Scaffold electron-vite React TS; strict tsconfig, ESLint, Prettier
- [x] Install stack deps (ARCHITECTURE.md §Stack); confirm `npm run dev` opens a window on macOS
- [x] CI workflow (lint/typecheck/unit) green
- [x] Create `docs/DECISIONS.md` for any deviation

## Phase 1 — Core engine (no UI)
- [x] `normalize.ts` + exhaustive unit tests (Arabic, Hebrew, English, mixed, codes, digits, offset map)
- [x] Test fixtures: generate sample workbooks with a script (`scripts/make-fixtures.ts`):
      Hebrew catalogue, Arabic price list, English supplier list, mixed sheet, merged headers,
      header on row 4, .xls, .csv (UTF-8 + Windows-1255/1256), corrupt file, password file,
      a 200k-row file for perf
- [x] Parser + header detection + name-column detection (tests)
- [x] SQLite schema, migrations, indexer worker with progress events, batched inserts
- [x] Search pipeline: FTS trigram + short terms + scope + ranking + fuzzy + highlights (tests)
- [x] Perf test: 500k rows query < 50 ms, indexing throughput logged

## Phase 2 — Main process
- [ ] SourceManager (add/remove, recursive scan, ignore rules), chokidar watching, change detection
- [ ] Typed IPC bridge + zod validation
- [ ] Bar window (always-on-top behaviour, click-through, custom drag, position memory, multi-monitor)
- [ ] Tray, global hotkey, single instance, auto-launch, electron-store settings, logging

## Phase 3 — UI (load design + motion skills first)
- [ ] Theme tokens, fonts bundled, i18n (ar/he/en) with RTL, motion tokens
- [ ] Onboarding flow (4 steps) with drag-drop and indexing progress
- [ ] Search bar + results panel + result card + copy (TSV + HTML + text) + toasts
- [ ] Scope picker (tree, multi-select, sheets, filter box)
- [ ] ⋯ menu, move mode, snap positions, hide/show
- [ ] Settings window (all tabs)
- [ ] Open-in-Excel helper (PowerShell COM, graceful fallback)
- [ ] All animations per DESIGN.md table + reduced-motion variants

## Phase 4 — Packaging & release
- [ ] App icon (SVG → ico/png)
- [ ] electron-builder config, release workflow on windows-latest
- [ ] Auto-updater + update pill
- [ ] README in 3 languages; screenshots/GIF
- [ ] Playwright e2e: onboarding → index fixtures → search he/ar/en → scope → copy → move bar

## Phase 5 — Polish & verify
- [ ] Go through ACCEPTANCE.md, fix everything
- [ ] Tag `v1.0.0`, confirm Release has the installer, download it, sanity-check on Windows
      (ask the owner to test on a Windows PC if none is available) 
- [ ] Ask owner before making the repo public
