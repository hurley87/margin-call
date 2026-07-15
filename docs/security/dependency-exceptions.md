# Dependency advisory exceptions

Production `pnpm audit --prod --audit-level=high` should remain clean (exit 0)
when the audit client works. **CI gates are suspended** while npm's legacy
`/-/npm/v1/security/audits` endpoint returns 410 (retired); local
`pnpm audit:*` scripts may fail the same way until pnpm uses the bulk advisory
API. This file documents **non-production** high/critical findings that remain
after overrides, so full-tree audit can be reviewed without blocking release of
app dependencies we do not ship.

Owner: Margin Call maintainers. Review on Dependabot PRs and at least quarterly.

## Security documentation

| Doc                                                                        | Purpose                                            |
| -------------------------------------------------------------------------- | -------------------------------------------------- |
| [`../SECURITY.md`](../../SECURITY.md)                                      | Vulnerability reporting and disclosure             |
| [`AUDIT_SCOPE.md`](./AUDIT_SCOPE.md)                                       | Commit, contracts, exclusions, stale-review caveat |
| [`threat-model.md`](./threat-model.md)                                     | Trust assumptions and threat themes                |
| [`role-matrix.md`](./role-matrix.md)                                       | Privileged roles, impact, rotation                 |
| [`base-sepolia-operations.md`](./base-sepolia-operations.md)               | Day-2 Base Sepolia runbook                         |
| [`incident-response.md`](./incident-response.md)                           | Pause, rotate, refund, rollback, recovery          |
| [`evidence-requirements.md`](./evidence-requirements.md)                   | Deploy / verify / operate evidence checklist       |
| [`base-sepolia-deploy-packet-211.md`](./base-sepolia-deploy-packet-211.md) | #211 Gate 1 pre-deploy approval packet             |

| Advisory                                                                                                                                                                                                                     | Package                            | Severity | Reachability                                                                                                                                                      | Mitigation                                                                                                                              | Expiry     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r), [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583), [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | `vite` `7.3.1` via `vitest@4.1.10` | high     | **Dev-only.** Vitest / Vite transform path used in unit tests and optional Vitest UI. Not in Next.js production bundle; UI server is not run in CI or production. | Stay on Vitest `4.1.x`; bump when Vitest ships a release that depends on Vite `>=7.3.5`. Do not expose Vitest UI on untrusted networks. | 2026-10-13 |

## Overrides already applied

See `package.json` → `pnpm.overrides` for transitive pins that cleared production
critical/high advisories (axios, ws, hono, path-to-regexp, lodash, js-cookie,
socket.io-parser, h3, defu, picomatch, form-data, flatted).

## Process

1. Run `pnpm audit:prod` — must pass at `--audit-level=high`.
2. Run `pnpm audit:all` — any **new** high/critical not listed above must be
   fixed with an upgrade/override or added here with reachability analysis.
3. Prefer fixing upstream over extending this table.
