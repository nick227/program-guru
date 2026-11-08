# POC release checklist

Status as of 2026-11-07 (evening). Backend baseline: `main` at `52339ac`; this checklist ships on
`claude/poc-go-live`. Nothing has been deployed: there is no Railway project, R2 bucket, Vercel project
or Resend domain yet.

**Verdict: not releasable yet.** The backend is ready once this branch merges. The remaining P0s are
**web screens that do not exist** (sign-up, email verification, password reset), **unmerged frontend
branches**, **provisioning**, and three **product decisions** (§4).

---

## 1. Inventory

### Branches

| Branch | State vs `main` | Content | Merge |
|---|---|---|---|
| `main` (`52339ac`) | baseline | Backend complete (154/154 operations), Media Library, groups, late join, Creator Channel specs | `origin/main` is still `71103c3` (not pushed) |
| `claude/poc-go-live` | +1 | **This checklist**: production build, bootstrap, health, config gate, CI, IaC | Clean |
| `feat/p1-notifications-reminders-inbox` (`7e8b5f1`) | +13, behind 0 | Notifications, reminders, inbox; received invitations and join flow; NOT_PARTICIPATING display; **contains Creator Studio** (`4221064`) and Codex's port fixes | Clean; frontend only |
| `feat/p1-plus-creator-studio` (`4221064`) | +5, behind 4 | Creator Studio screens (library, publishing, channel, audience, dashboard) | Already inside the notifications branch |
| `feat/p1-activity-authoring` (`12654fa`) | +5, behind 4 | Activity media history and historical attachment management (web) | Clean; frontend only |
| `codex/media-foundation` (`9a6d2e8`) | +2, behind 7 | Vite port fixes for mocked e2e | Already inside the two branches above |
| `feat/p1-group-experience` | at old `71103c3` | No commits | See uncommitted work |
| `claude/*` | behind `main` | Fully merged into `main` | Can be deleted |
| `dependabot/...` | PR #1 | 34 dependency bumps; CI failing | **Hold** until after release |

### Uncommitted work

| Worktree | Files | Risk |
|---|---|---|
| `programs-app-groups` (`feat/p1-group-experience`, based on **old `71103c3`**) | 13: `Groups.tsx`, `ProgramGroups.tsx`, `useGroups.ts`, `groups.spec.ts`, `App.tsx`, `Program.tsx`, plus **backend** edits to `group.service.ts`, `worker/handlers.ts`, `groups.test.ts` | **Duplicates the notifications branch**: both add `useGroups.ts`, `/join/:token` and a group page, so their merge is a guaranteed add/add conflict. Its backend edits re-solve what `b4fcc98` already handles, and they put the **raw invitation token into the notification deep link** (stored in `Notification` rows). Rebase onto `main` and drop the backend edits. |
| all other worktrees | clean | — |

## 2. Fixed on `claude/poc-go-live` (verified)

| Was | Now |
|---|---|
| **P0: production API and worker could not start.** `node dist/index.js` crashed (`@project/db` is TypeScript source) | esbuild bundle (`apps/server/scripts/build.mjs`) builds `dist/{index,worker,bootstrap}.js`; workspace code inlined, npm packages external; `@prisma/client` declared by the server |
| **P0: signed media and email links fell back to the public secrets `dev-only-media-secret` / `dev-only-email-secret`.** Signed URLs carry `viewerId`, so this allowed reading other users' private media | `lib/config.ts` refuses to start any production process with missing or weak (<32 characters) or identical secrets, non-https URLs, local storage, or captured email |
| **P0: seed media unusable in production.** Solid-colour placeholders written only to local disk (404 behind R2); "demonstration videos" were 1-second teal clips | 80 committed, checksummed, CC0 title-card illustrations (`packages/db/prisma/platform-assets/`, about 2.6 MiB) published through the storage layer (R2 in production). Placeholder clips retired and hidden |
| No production bootstrap. `db:seed` is (correctly) refused off localhost | `pnpm --filter server bootstrap:prod`: checks every migration is applied, then publishes media and upserts the catalog. Idempotent: a re-run leaves all 20 catalog tables byte-identical and uploads 0 files. Never overrides moderation or archive decisions; creates no users |
| `/health` always said ok | `/health` returns 503 unless the database answers within 2 s |
| Worker could start without ffmpeg and leave uploads stuck in PROCESSING | Worker preflight checks ffmpeg, ffprobe, the database and storage, and exits non-zero |
| `railway.json` is **deprecated; new services cannot use it** and it stops being read on 2026-12-01. No start commands, and no ffmpeg for the worker | `.railway/railway.ts` (IaC): MySQL, API, worker, build, pre-deploy, start commands, `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`, secrets as `preserve()`. `railway.json` removed |
| **CI has never passed**: `pnpm/action-setup` failed on two pnpm versions, then tests would have failed (no `TEST_DATABASE_URL`, no ffmpeg) | Fixed, plus a production build step. **Unconfirmed until it runs on GitHub** |
| `.env.example` missed `COOKIE_DOMAIN`, the media limits, `TEST_DATABASE_URL` and more | Complete |

### Evidence

- Server tests 271/271 (including the config gate and seed idempotency), media e2e 19/19 (real API and worker), typecheck, lint, SDK drift, web build.
- Production rehearsal on a fresh database (`programs_app_claude_prod`):
  - bootstrap before migrations refuses ("run pnpm db:deploy before bootstrap")
  - `migrate deploy` applies `0001`–`0005`
  - bootstrap ×3: identical summaries, 0 uploads after the first, catalog checksums unchanged, an archived starter Program and a moderated Activity stay that way, 0 users
  - bundled API in `NODE_ENV=production`: refuses to start without config (lists all 8 problems); `/health` 200; a seeded illustration is served byte-identical to its manifest checksum; `/health` 503 with an unreachable database
  - bundled worker passes preflight

## 3. Deployment order

```
1. Provision (§6), set secrets (§5) on both services
2. git push main            → CI green (typecheck, lint, drift, migrations, tests, prod build)
3. railway config plan      → review → railway config apply (with explicit approval)
4. API deploy:    build → preDeploy: pnpm db:deploy && pnpm --filter server bootstrap:prod
                  → start → healthcheck /health (200 only when the database answers)
5. Worker deploy: build → preDeploy: pnpm db:deploy (no-op after the API; Prisma advisory lock)
                  → start → preflight (ffmpeg, ffprobe, database, R2) or crash
6. Vercel deploy (VITE_API_URL=https://api.<domain>) → smoke test (§7)
```

Migrations are additive and run only via `prisma migrate deploy`. Bootstrap fails the deploy if any committed migration is unapplied, so new code never runs on an old schema.

## 4. P0 blockers

| # | Blocker | Owner | Notes |
|---|---|---|---|
| ~~1~~ | ~~No sign-up screen~~ | Resolved | `/register` (`pages/Auth.tsx`), linked from login |
| ~~2~~ | ~~`/verify-email` and `/reset-password` missing~~ | Resolved | Plus `/forgot-password` from login; verification-required, invalid, expired and used-link states |
| ~~3~~ | ~~Vercel SPA fallback missing~~ | Resolved | `apps/web/vercel.json` rewrite; live suite checks direct navigation and refresh on the production build |
| 4 | **Frontend branches unmerged; duplicate group work** (§1) | Coordinator | Merge order: notifications (includes Creator Studio) → activity-authoring → groups worktree **after** rebasing onto it and dropping its backend edits. Run the browser suite after each |
| 5 | **Infrastructure not provisioned** (§6) | Ops | Nothing exists yet |
| 6 | **Push `main` and get CI green** | Ops | `origin/main` is 2 integration commits plus this branch behind |
| 7 | **Decision: demonstration videos.** The spec puts "selected demonstration videos" in V1; there is no real footage. The 5 Activities marked `hasVideo` now ship with illustrations only | Product | Accept illustrations-only for the POC, or license or record footage |
| 8 | **Decision: moderation and reports without a UI.** The API exists (queue, approve/reject, reports), but no screen. Public contributions stay PENDING forever; reports go unread | Product | Invite-only POC: operate via API (runbook) or disable public contributions. Public launch: build the moderation screen |
| 9 | **Decision: legal for a public launch.** No Terms or Privacy pages, no account deletion or data export, and the specs don't cover them. Accounts hold email, private results and media | Product/Legal | Invite-only POC with consent may defer; a public launch should not |
| 10 | `.railway/railway.ts` not yet validated: `railway config plan` needs a linked project and the `railway` SDK package | Ops | No healthcheck field appears in the IaC reference used: confirm, or set **Healthcheck Path `/health`** on the API in the dashboard |

## 5. Required secrets and variables

| Variable | API | Worker | Value |
|---|:-:|:-:|---|
| `DATABASE_URL` | ✓ | ✓ | `${{MySQL.MYSQL_URL}}` (IaC: `db.env.MYSQL_URL`) |
| `NODE_ENV` | ✓ | ✓ | `production` |
| `MEDIA_URL_SECRET` | ✓ | ✓ | `openssl rand -hex 32`; **same on both** services |
| `EMAIL_LINK_SECRET` | ✓ | ✓ | `openssl rand -hex 32`; same on both; different from the media secret |
| `PUBLIC_API_URL` | ✓ | ✓ | `https://api.<domain>` |
| `PUBLIC_APP_URL` | ✓ | ✓ | `https://app.<domain>` |
| `CORS_ORIGIN` | ✓ | | `https://app.<domain>` |
| `CLIENT_IP_HEADER` | ✓ | | `x-real-ip` (Railway's documented client-IP header; trusted only from private/CGNAT proxy peers) |
| `TRUSTED_PROXY_CIDRS` | ✓ | | Leave unset (private + CGNAT ranges) unless Railway's proxy source differs; see the hosted check in UAT-HANDOFF §5 |
| `COOKIE_DOMAIN` | ✓ | | Leave unset (host-only cookie on the API host) unless deliberately sharing |
| `STORAGE_PROVIDER` | ✓ | ✓ | `r2` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | ✓ | ✓ | R2 API token scoped to the one bucket (object read/write) |
| `EMAIL_PROVIDER` | | ✓ | `resend` |
| `RESEND_API_KEY`, `EMAIL_FROM` | | ✓ | Sending-only key; `EMAIL_FROM` on the verified domain |
| `RAILPACK_DEPLOY_APT_PACKAGES` | | ✓ | `ffmpeg` |
| `GOOGLE_CLIENT_ID` | ✓ | | Optional; only if Google sign-in UI ships |
| `MARKETPLACE_ENABLED` | ✓ | ✓ | `false` (Stripe variables not needed while false) |
| Vercel: `VITE_API_URL` | | | `https://api.<domain>` (build time) |

The startup gate enforces every required row: a missing value fails the deploy with a list, rather than running insecurely.

## 6. Manual provisioning

1. **Domain**: one registrable domain with `app.` (Vercel) and `api.` (Railway) as **sibling subdomains**. Session cookies are `SameSite=Lax`, which needs same-site origins (`05-ARCHITECTURE.md`).
2. **Railway**: create the project, link it (`railway link`), `npm install railway` for the `.railway` config, `railway config plan`, review, apply. Add custom domain `api.<domain>`. Enable MySQL backups. Set secrets (§5).
3. **Cloudflare R2**: create the bucket (private) and a bucket-scoped API token. CORS: allow `PUT` from `https://app.<domain>` with header `content-type` (direct uploads); no public access needed (the API proxies reads).
4. **Resend**: verify the sending domain (SPF, DKIM, DMARC) and create a sending-only key.
5. **Vercel**: import `apps/web`, set `VITE_API_URL`, add `vercel.json` (P0 #3), custom domain `app.<domain>`.
6. **GitHub**: confirm CI passes on `main`; protect `main`; hold the Dependabot PR.
7. **Google OAuth** (only if shipping Google sign-in): authorized origin `https://app.<domain>`.
8. **Stripe**: not for the POC (`MARKETPLACE_ENABLED=false`); ADR 0001 lists live verification before enabling.

## 7. Post-deploy smoke test

`/health` 200 → register (once P0 #1 lands) → verification email arrives and its link works → discover shows 5 starter Programs with illustrations → join one, and the calendar fills → finish an Activity with a photo; the worker makes it READY within seconds → create a group and invite a second account by handle → accept with schedule confirmation → each sees the other's completion, never their results → leave the group; access ends at once and history remains.

## 8. P1 follow-ups

- **Instructional illustrations.** Current cards are informative title cards, not how-to drawings. Replace per Activity through the same manifest (new files, `MANIFEST_VERSION` bump).
- **Moderation UI** (if deferred under P0 #8) and **report handling**.
- **Google sign-in UI** (API ready).
- Error tracking and alerting (none today; Railway logs only). Consider Railway tracing.
- ESLint for `apps/web` (excluded today; Phase 5 gate).
- Dependency updates (Dependabot PR) after release, behind green CI.
- Update `CLAUDE.md` deploy notes after the first real deploy (operations count 154, IaC instead of `railway.json`).
- Reconcile frontend branches with backend contract additions: `participationStartDate`, `NOT_PARTICIPATING` (done on notifications branch), received invitations (done there), Activity media history (activity-authoring).

## 9. Remaining product gaps (spec vs built)

| Area | Spec | Built |
|---|---|---|
| Accounts | Sign-up, verification, reset, Google | Built, except the Google sign-in UI (P1). Live suite: `pnpm exec tsx apps/web/scripts/auth-live.ts` |
| Calendar, Activity page, sessions, results | `03-UX`, `09` | Built (web on `main`) |
| Program authoring | Workspace, auto scheduling | Built (web on `main`) |
| Media library, capture, attachments, history | `11` | Built (Codex); history UI on activity-authoring |
| Groups, invitations, join, late join | `10` | API complete; web on notifications branch **and** groups worktree (duplicate) |
| Notifications, reminders, daily email | `12`, `09` | API complete; web on notifications branch |
| Creator Studio / Channel (P1+) | `01` §10 | Web scaffold on notifications branch; channel backend phases not started (P1+, not POC) |
| Discovery, follows, likes, public profiles | `12`, `13` | Built |
| Achievements | `09` §9a | API complete; web on notifications branch |
| Moderation and reports | MVP | **API only** |
| Demonstration videos | `01` (V1) | **None** (decision P0 #7) |
| Purchases and subscriptions | After core | Built behind `MARKETPLACE_ENABLED=false` |
| Legal: terms, privacy, deletion | Not specified | **None** (decision P0 #9) |
