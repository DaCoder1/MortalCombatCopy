# Working agreement for AI agents

## Branch workflow (required)

- **All changes go on the `dev` branch.** Before starting work: `git fetch origin dev && git checkout dev && git pull origin dev`.
- Commit every change to `dev` and push it with `git push -u origin dev`.
- **Never push to or merge into `main` without explicit approval from the repo owner in the conversation.** Examples of approval: "approve", "ship it", "merge to main". A request to make changes is not approval to release them.
- When the owner approves, fast-forward `main` to `dev` and push it:
  ```
  git fetch origin && git checkout main && git pull origin main
  git merge --ff-only dev   # or `git merge dev` if main has diverged
  git push origin main
  git checkout dev
  ```
- If a session is set up with a different working branch (e.g. `claude/...`), still treat `dev` as the integration branch. Push the work to `dev` too, and keep `main` gated on approval.

## Project notes

- Plain HTML5 canvas + vanilla JS with no build step. Open `index.html` to run it.
- Scripts are classic `<script>` tags loaded in order (see `index.html`), so the files share globals.
- Smoke test: load the page in headless Chromium (Playwright) and call the global `step()` in a loop. The title screen runs an AI-vs-AI demo, so this exercises fights, KOs and fatalities. Check that there are no `pageerror`s.
