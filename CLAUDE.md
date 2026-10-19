# CLAUDE.md — Furniture Finder

You are Claude Code. This folder contains the complete specification for **Furniture Finder**:
a Windows desktop app that indexes a furniture company's Excel files and gives them a
floating, always-on-top search bar that searches every row of every file in Hebrew, Arabic
and English, with copy-paste results and polished motion design.

Your job: build the whole project from this spec, turn this folder into a GitHub repository,
and set up automated Windows installer builds.

## Read these first (in order)
1. `docs/SPEC.md` — what the app does (product behaviour, every screen, every feature)
2. `docs/ARCHITECTURE.md` — stack, processes, data model, search engine, file layout
3. `docs/DESIGN.md` — visual design, RTL rules, full motion/animation spec
4. `docs/BUILD_AND_RELEASE.md` — installer, GitHub Actions, releases, auto-update
5. `docs/TASKS.md` — phased build plan; work through it in order and tick items off
6. `docs/ACCEPTANCE.md` — the checklist the finished app must pass

If any doc conflicts with another, SPEC.md wins for behaviour, DESIGN.md wins for look/motion.

## Step 0 — Make this folder a GitHub repository (do this first)
The owner develops on a Mac but the app ships for **Windows**. Windows installers are
built by GitHub Actions on `windows-latest`, so the repo must exist on GitHub.

1. Check tooling: `git --version`, `gh --version`, `gh auth status`.
   - If `gh` is missing: `brew install gh`. If not logged in, ask the owner to run
     `gh auth login` (do not handle their password or token yourself).
2. In this folder:
   ```bash
   git init -b main
   # write .gitignore first (node_modules, dist, out, release, *.log, .DS_Store, coverage)
   git add -A && git commit -m "chore: project spec for Furniture Finder"
   gh repo create furniture-finder --private --source . --remote origin --push \
     --description "Floating multilingual Excel search bar for Windows"
   ```
3. The repo starts **private** while it's being built. When the owner is ready for their
   dad to download it, they flip it public (`gh repo edit --visibility public
   --accept-visibility-change-consequences`) — ask before doing this, never do it silently.
   Note: auto-update and public downloads from GitHub Releases only work once the repo is public
   (see BUILD_AND_RELEASE.md).
4. Commit after each phase in TASKS.md with conventional commit messages, and push.

## Non-negotiables
- **Windows 10/11 x64 target.** Code must also run on macOS for development (`npm run dev`).
- **Stack:** Electron + React + TypeScript + Vite (electron-vite), Motion (framer-motion),
  SheetJS (`xlsx`) for parsing, `better-sqlite3` with FTS5 for the index, `chokidar` for
  watching, `electron-builder` (NSIS) for the installer, `electron-updater` for updates.
  Don't swap these without a strong reason written into `docs/DECISIONS.md`.
- **All search is local and offline.** No file content ever leaves the computer.
  No telemetry, no analytics, no network calls except the update check.
- **Never modify the user's Excel files.** Open read-only. Indexing must work even when the
  file is open in Excel (copy to temp or read with shared access if locked).
- **Hebrew, Arabic and English everywhere** — UI language selectable, RTL handled correctly,
  search normalisation as specified in ARCHITECTURE.md §Search.
- **Motion is a feature, not decoration** — follow DESIGN.md exactly, respect
  "reduce motion" (Windows setting + in-app toggle).
- **The user is a non-technical older adult.** Large readable text, obvious buttons,
  forgiving behaviour, no jargon, no scary dialogs. If something fails, say what to do in
  plain words in their UI language.

## Skills / quality bar
Use whatever skills you have available for frontend design, motion design and testing.
Load them before the matching phase (design skill before building UI, motion skill before
animations). Write unit tests for normalisation, parsing and search ranking (Vitest), and
Playwright-Electron smoke tests for the main flows.

## Definition of done
Every box in `docs/ACCEPTANCE.md` is ticked, `npm run test` passes, a tagged release
(`v1.0.0`) on GitHub has a working `Furniture-Finder-Setup-1.0.0.exe` built by Actions,
and `README.md` explains installing it in English, Arabic and Hebrew.
