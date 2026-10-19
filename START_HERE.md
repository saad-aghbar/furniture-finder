# Start here

1. Open Terminal and go into this folder:
   ```
   cd ~/Downloads/furniture-finder
   ```
2. Make sure you're logged into GitHub CLI once: `gh auth login` (install with `brew install gh` if needed).
3. Start Claude Code: `claude`
4. Paste this prompt:

---
Read CLAUDE.md and everything in docs/. Then do Step 0: turn this folder into a git repo and
create a PRIVATE GitHub repo called furniture-finder on my account and push it. After that,
build the entire app by following docs/TASKS.md phase by phase, committing and pushing after
each phase, until every item in docs/ACCEPTANCE.md passes. Use your frontend-design and
motion skills for the UI. Ask me before making the repo public.
---

Tip: it's a big build. If Claude Code stops between phases, just say
"continue with the next phase in docs/TASKS.md".
