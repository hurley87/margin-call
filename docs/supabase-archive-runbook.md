# Supabase Archive Runbook

## Purpose

This runbook records the hosted Supabase archive window required by issue #91 and the Convex parity sign-off required before permanent deletion.

## Ownership

- Primary owner: Platform team
- Backup owner: On-call engineer

## Archive Policy

- Do not delete Supabase at cutover.
- Archive/pause the hosted project for a 7-14 day parity window.
- Delete only after Convex parity is verified against PRD Definition of Done.

## Execution Checklist

### 1) Pre-archive verification

- [ ] `main` is deployed with Convex-only runtime paths.
- [ ] No Supabase runtime imports remain in `src/` (`rg "@/lib/supabase|@supabase/supabase-js" src` returns no matches).
- [ ] Full game loop smoke-tested on Convex (create trader, configure desk, enter/resolve deal, validate activity + narrative + leaderboard).

### 2) Archive action

- [ ] Record project id: `onnxgjahctckjuoqwdxt`
- [ ] Set project to paused/archived state in Supabase dashboard.
- [ ] Record archive timestamp (UTC): `________________`
- [ ] Record archive operator: `________________`

### 3) Parity window checks (daily)

- [ ] Convex app health checks pass.
- [ ] No production path requires Supabase credentials.
- [ ] No rollback requests require re-enabling Supabase.

### 4) Delete approval gate (after 7-14 days)

- [ ] Parity sign-off by engineering owner: `________________`
- [ ] Product sign-off: `________________`
- [ ] Incident review confirms no Supabase dependency regressions.

### 5) Permanent deletion

- [ ] Record deletion timestamp (UTC): `________________`
- [ ] Record deletion operator: `________________`
- [ ] Remove archived-project references from ops docs.

## Evidence Log

| Item                       | Value              |
| -------------------------- | ------------------ |
| Cutover commit/PR          | `________________` |
| Archive date (UTC)         | `________________` |
| Parity sign-off date (UTC) | `________________` |
| Deletion date (UTC)        | `________________` |
