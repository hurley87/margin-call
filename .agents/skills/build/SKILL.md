---
name: build
description: Use only in the Margin Call project when the user invokes $build with either a GitHub issue URL or a plain-language description of what to build. Creates an isolated Git worktree, copies local ignored runtime files such as .env.local and .mcp.json, then implements the requested change. Do not use this skill for other repositories.
---

# Build

## Overview

Use this skill when the user wants Codex to build a Margin Call change from one argument:

- A GitHub issue URL, for example `$build https://github.com/hurley87/margin-call/issues/123`
- A plain-language brief, for example `$build add a confirmation state to deal entry`

The primary checkout is `/Users/davidhurley/Desktop/margin-call`. This skill is project-specific. Do not generalize it to other repos or mention other repo workflows unless the user explicitly asks for that comparison.

## Input Handling

Treat everything after `$build` as the build argument.

- If the argument contains a GitHub issue URL, inspect the live issue body and comments first. Use the issue as the working brief, then inspect nearby repo rails before editing.
- If the argument is plain text, use it as the working brief. Read the relevant code before deciding how to implement it.
- If the argument is missing or too ambiguous to act on safely, ask one concise clarification question.
- Preserve exact user wording when it defines user-facing behavior.

## Default Workflow

1. Inspect current branch/worktree state before changing anything:

```bash
git status --short --branch
git worktree list --porcelain
```

2. Create a feature slug from the issue number/title or brief. Use a `codex/` branch name.

3. Reuse an existing worktree when possible. If `git worktree list --porcelain` shows `refs/heads/codex/<slug>` already checked out at `../margin-call-worktrees/<slug>`, continue work in that path. Do not run `git switch codex/<slug>` from the primary checkout; Git will reject switching to a branch that is already owned by another worktree.

4. If no matching worktree exists, create a feature worktree from current `origin/main`:

```bash
git fetch origin
git worktree add ../margin-call-worktrees/<slug> -b codex/<slug> origin/main
```

5. Bootstrap ignored local runtime files from the primary checkout:

```bash
/Users/davidhurley/Desktop/margin-call/.agents/skills/build/scripts/bootstrap-margin-call-worktree.sh ../margin-call-worktrees/<slug>
```

6. Implement the requested change in the worktree. Keep edits scoped to the brief and existing project patterns.

7. Run focused checks when practical. If the worktree lacks dependencies, install them only when needed for the checks:

```bash
cd ../margin-call-worktrees/<slug>
pnpm install
```

Do not start the local dev server unless the user explicitly asks; the user will run it themselves.

## Runtime File Policy

- Copy `.env.local` into each worktree; do not symlink it by default.
- Copy `.mcp.json` if present; it is ignored because it can contain secrets.
- Copy `.env.development.local`, `.env.test.local`, and `.env.production.local` if present.
- Never commit copied env/config files.
- If the worktree uses a different tunnel, port, Convex deployment, or app URL, edit only that worktree's copied env file.

Copying is preferred over symlinking because `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT`, tunnel URLs, and local test secrets may need to differ between checkouts.

## Margin Call Caveats

- The repo ignores all `.env*` except `.env.example`; `.env.local` is expected to remain local-only.
- For Convex code, read `convex/_generated/ai/guidelines.md` before editing Convex files.
- `pnpm install` may warn about ignored build scripts under pnpm v10; current checks generally do not require those native build scripts.
- `pnpm lint` has known pre-existing failures, so prefer focused lint/test commands unless the user asks for a full lint pass.

## Known Worktree Failure Modes

- `fatal: 'main' is already used by worktree at '/Users/davidhurley/Desktop/margin-call'`: the primary checkout owns `main`. Work from a feature branch in the linked worktree, or land final changes from the primary checkout when the user specifically asks to push `main`.
- `fatal: 'codex/<slug>' is already used by worktree at '<path>'`: the requested branch already has a worktree. This is not a failed build. Continue from `<path>` and do not switch the primary checkout to that branch.
- `Command "eslint" not found` or similar pnpm binary failures in a linked worktree: that worktree likely has no `node_modules`. Run `pnpm install` there, or verify from the primary checkout if appropriate.

## Cleanup

After the branch is merged or no longer needed:

```bash
git worktree remove ../margin-call-worktrees/<slug>
git worktree prune
```

Before removing a worktree, check for uncommitted changes:

```bash
git -C ../margin-call-worktrees/<slug> status --short
```
