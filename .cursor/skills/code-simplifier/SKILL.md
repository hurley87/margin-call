---
name: code-simplifier
description: >-
  Simplifies and refines Dinari Alloy App code for clarity, consistency, and
  maintainability without changing behavior. Use when the user asks to simplify,
  clean up, or polish recent changes, or after edits to alloys UI, features,
  hooks, or shared lib code in this Next.js repo.
---

# Code simplifier (Dinari Alloy App)

## Scope

- Prefer **recently modified or session-touched files** unless the user asks for a wider pass.
- **Preserve behavior**: outputs, UX, API contracts, and tests must stay equivalent. Refactor structure and naming only.

## Project context

This repo is the **Dinari Alloy App**: Next.js 16, React 19, TypeScript, Tailwind CSS 4, Shadcn/ui, TanStack React Query, React Hook Form + Zod, WorkOS AuthKit. Follow **`CLAUDE.md`** and existing code in `src/` for architecture (App Router, `src/features/alloys`, `src/components/alloys`, `src/lib`, proxy auth).

## Standards to apply

- **Imports**: ES modules; use `@/` paths as elsewhere in the repo; match existing import grouping (no new style wars).
- **Functions**: Prefer the `function` keyword for top-level and component bodies where the codebase already does (e.g. `memo(function Name(…) { … })`). Inline arrows for small callbacks are fine.
- **React**: Server Components by default; `"use client"` only when hooks or browser APIs are needed. Keep explicit prop types (inline or named) consistent with neighboring components.
- **Data / forms**: TanStack Query for server state; React Hook Form + Zod for forms—simplify without changing query keys, cache updates, or validation rules unless fixing a bug.
- **UI**: Reuse Shadcn components under `src/components/ui/` and Tailwind tokens (`bg-primary`, `text-foreground`, etc.).
- **Errors**: Prefer clear early returns and small helpers; avoid extra `try/catch` when the project already surfaces errors via hooks, `getErrorMessage`, or API utilities.

## Clarity refinements

- Reduce nesting; extract small helpers or early returns when it improves scanability.
- Remove redundant abstractions and duplicate logic; consolidate without changing public behavior.
- Prefer **switch or if/else** over **nested ternaries** for multiple branches.
- Remove comments that only restate the code; keep comments that explain non-obvious domain or API constraints.
- Favor **readable, explicit** code over fewer lines or clever one-liners.

## Avoid

- Drive-by changes outside the requested or recently touched scope.
- Over-merging unrelated concerns into one component or hook.
- Removing abstractions that keep features (`src/features/`) or alloy types (`src/types/alloy.ts`) organized.
- Behavior changes, shortcutting auth, proxy, or session assumptions documented in `CLAUDE.md`.

## Process

1. Identify the diff or files in scope.
2. Check patterns in adjacent files in the same folder or feature.
3. Apply simplifications that match project conventions.
4. Run **`pnpm lint`** and **`pnpm test:run`** when changes are non-trivial.

## Verification

- Behavior unchanged (including loading, empty, and error states).
- Types still align with `src/types/alloy.ts` and API usage.
- No new unnecessary client boundaries or query-cache regressions.
