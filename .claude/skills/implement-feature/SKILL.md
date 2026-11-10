---
name: implement-feature
description: Use when the user gives a GitHub issue number for agg-campaign-manager-v2 and asks to implement it — reads the issue, asks open questions, builds it on a branch from main with small commits, and opens a PR into main.
---

# Feature Implementation Workflow

## Overview

Read the issue → ask questions → branch from `main` → implement and verify step by step → commit → PR into `main` → explain.
Never write code before questions are answered. Never open the PR before the work is committed and verified.

## Step 1 — Read

```bash
gh issue view <issue-number> --comments   # body, labels, milestone, discussion
```

Extract the goal, the acceptance criteria, and any linked issues or designs. Then read the code the change touches and the rules in `.claude/rules/` that apply to it (`tanstack-start.md` for server functions and routes, `react-components.md` for UI).

## Step 2 — Ask questions before coding

In ONE message, surface:

- Ambiguous acceptance criteria
- Which roles may see or use the feature (`src/auth/roles.ts`)
- Which programs it applies to (KKB, DKB, all), and whether the value belongs in program config
- Any schema change, new environment variable, external API call, limit or threshold that needs confirming
- A short plan, one line per step with how each is verified

**Wait for the answers before proceeding.**

## Step 3 — Create the branch

Follow the workspace's worktree rule when it has one; otherwise a plain branch:

```bash
git fetch origin
git switch -c feat/<issue-number>-<short-slug> origin/main
# e.g. feat/42-launch-retry
```

Slug = lowercase-hyphenated from the issue title. Use `fix/` for bug fixes.

## Step 4 — Implement step by step

For each step of the plan:

1. Write the test first when the step has logic (`.claude/rules/testing-requirements.md`).
2. Implement.
3. Verify: `bun x tsc --noEmit` and `bun run test`; `bun run test:db` when the schema or SQL changed; `bun run db:generate` after a schema change.
4. Stage the files for this step only (no `git add .`).
5. Commit with a Conventional Commits subject and the issue in the body:

```
feat(launch): retry a failed Raya batch once

Refs #42
```

Rules:

- One logical step per commit. Use `fix`/`chore`/`test`/`docs`/`refactor` instead of `feat` when more accurate.
- The issue reference goes in the commit body (`Refs #NNN`), not the subject.
- No AI attribution trailers (see `CLAUDE.md`).

If the change grows past the size limit in `.claude/rules/pull-requests.md`, stop and propose a split before continuing.

## Step 5 — Open the PR

Run `bun run build` once more, push, and open the PR into `main`:

```bash
git push -u origin HEAD
gh pr create --base main \
  --title "feat: <issue title>" \
  --body "$(cat <<'EOF'
## Summary
<What changed and why, in plain English.>

## In Plain Terms
<The problem and what this change does, for a non-technical teammate.>

## Release Notes
- <User-facing change, or "None.">

## Checklist
- [ ] Type-check, build and tests pass
- [ ] Database migration included (if the schema changed)
- [ ] New server functions check the caller's role

Closes #<issue-number>
EOF
)"
```

Then watch CI with `gh pr checks <number>` and fix anything red before asking for review.

## Step 6 — Explain the feature

After the PR URL is printed, write a short plain-language summary:

1. **What was built** — each changed area and its purpose in one sentence.
2. **Why it matters** — the problem it solves for the people using the dashboard.
3. **What to check** — anything the reviewer should try by hand, and any follow-up left out on purpose.

Three short paragraphs at most.

## Common mistakes

- Coding before questions are answered → wait
- Trusting the browser: a hidden button is not a permission check → `requireRole` in the server function
- Hardcoding a program-specific value in a component → program config
- Schema change without the generated migration → CI schema-drift failure
- Using `git add .` → stage specific files only
