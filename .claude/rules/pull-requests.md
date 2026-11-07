# Rule: Pull Requests

Applies to every change you open a pull request for.

## Branches

- Branch from `main` and open the PR into `main`. Never push to `main` directly.
- Name branches `<type>/<topic>`, for example `feat/launch-retry`, `fix/session-expiry`, `chore/claude-rules`. Use a worktree under the workspace's `git-worktrees/agg-campaign-manager-v2/` folder when the workspace sets one up.

## Size

Keep each PR small enough to review in one sitting.

- Aim for at most **10 files** and **300 changed lines** (added plus removed, from `git diff --shortstat origin/main`). Generated files (`src/routeTree.gen.ts`, migration snapshots under `src/server/db/migrations/meta/`) and `bun.lock` do not count.
- A larger change splits into several PRs that each build, type-check and pass tests on their own, merged in order. A schema change and its migration go in the first PR that needs them.
- A PR bigger than the limit is allowed only when the user approves it explicitly, in this session, for this change. To ask, state the file and line counts and why one PR reviews better than several.
- Keep unrelated changes out: a refactor, a formatting pass, or a dependency bump is its own PR.

## Before asking for review

- `bun x tsc --noEmit`, `bun run build` and `bun run test` pass locally. Run `bun run test:db` too when the schema, migrations or SQL changed.
- A schema change includes the generated migration (`bun run db:generate`).
- No new ESLint or Prettier problems in the files you changed.
- CI on the PR is green. Check it with `gh pr checks <number>` and report the result. Do not ask for review on a red or unchecked PR.

## Description

Follow the PR description rules in `CLAUDE.md`: plain English, headings Summary, Release Notes and Checklist, an **In Plain Terms** section, and no AI attribution.
