# Program Guru: UAT handoff

**Release candidate:** the UAT readiness commit on `main` directly after `cabfc63` (this revision of
this file). Local only: not pushed (`origin/main` is behind) and not deployed.

| Integrated in this candidate | Commit |
|---|---|
| UAT readiness: client IP behind the proxy, live test harness, port guards | this commit |
| Group Experience (Copilot), fast-forwarded with no conflicts | `11699a9` |
| Activity attempt history and Activity Authoring | `354eea8` |
| Account screens (register, verify, forgot/reset password), Vercel SPA fallback | `d3c83bc` |
| Production bundles, config security gate, deterministic bootstrap, CI, Railway IaC | `20f2c68` |
| Antigravity release candidate (notifications, reminders, inbox, Creator Studio) | `d05d842` |
| Performance hardening (Cursor) | `00de89d`, `d412e3d` |
| Group participation, late join, Media Library, media history | `b4fcc98`, `2ff182e`, `5c3a3eb` |

Group integration checks: one group page and one canonical route set (`/join/:token`, `/groups/:id`,
`/groups/:id/invitations/:invitationId`), no duplicate SDK hooks, and handle-invitation notifications
store only `/groups/{id}/invitations/{invitationId}` (no token). The email path's token is scrubbed
from the outbox after sending.

## 1. Test results (2026-11-07, on this candidate)

| Suite | Result |
|---|---|
| Typecheck (all packages), lint, SDK drift and SDK typecheck, OpenAPI validation | Clean |
| Server integration tests (`programs_app_claude_test`), including client-IP and rate-limit cases | **296 / 296** |
| Worker tests (media pipeline, outbox, reminders) | 10 / 10 (included above) |
| Web unit tests | 22 / 22 |
| Browser suite, mocked API, desktop + mobile | **90 / 90** |
| Production builds: API, worker, bootstrap bundles; web | Built |

Live suites, run **back to back**; each has its own API, worker and dedicated database:

| Live suite | Command | Result |
|---|---|---|
| Account screens: register → verify → sign in; reset; invalid/expired links; direct navigation | `pnpm exec tsx apps/web/scripts/auth-live.ts` | 4 / 4 |
| Activity history (25 attempts, pagination, detach/restore, authorization); account-switch isolation; discovery → author → publish → join → Finish/Undo | `pnpm exec tsx apps/web/scripts/history-live.ts` | 3 / 3 |
| Media upload → READY → attach → view → detach, photo and video | `MEDIA_TEST_DATABASE_URL=… pnpm exec tsx apps/web/scripts/media-live.ts` | 2 / 2 |
| Handle invitation → acceptance → calendar; removal/leave revocation; reminders; preferences | `pnpm exec tsx apps/web/scripts/notifications-live.ts` | 1 / 1 |
| Real API + worker over HTTP: media pipeline, privacy, groups, retries, cleanup | `pnpm --filter server media:e2e` | 19 / 19 |

Local dev API (`:3001`): `/health` 200; dev database migrations up to date.

### Client IP and rate limits (fixed in this candidate)

Railway documents one client-IP header, `X-Real-IP`; its `X-Forwarded-For` handling and proxy source
addresses are not documented. The API now:

- never reads `X-Forwarded-For`;
- uses `X-Real-IP` only when `CLIENT_IP_HEADER=x-real-ip` **and** the TCP peer is in `TRUSTED_PROXY_CIDRS` (default: private and CGNAT ranges, which internet clients cannot connect from); otherwise it uses the socket address;
- refuses to start in production without an explicit `CLIENT_IP_HEADER` (`x-real-ip` or `none`).

Tests run on a real app with rate limiting enabled and two instances sharing the database:
- two clients behind one proxy have independent sign-in limits;
- one client repeating requests is limited (429 after 10 sign-ins; global 429 after 300 requests a minute, with `retry-after`);
- spoofed `X-Real-IP`/`X-Forwarded-For` from an internet peer cannot escape the limit;
- rotating `X-Forwarded-For` through the proxy does not create new identities;
- the per-email sign-in limit still applies across clients;
- limits hold across instances.

With the old code, the two independent-client cases fail.

**Harness traffic vs independent clients:** in `history-live.ts`, each spec is its own client (a
distinct `X-Real-IP`, trusted only from loopback in that harness), so specs no longer share one
rate-limit bucket. Earlier, the journey got a 429 after the history spec only because all local test
traffic shared `127.0.0.1`. Runners now refuse a port that is already in use.

## 2. UAT scenarios

Use two or three accounts, ideally on separate browsers or devices.

1. **Account**: register → "Confirm your email" → open the emailed link → Email confirmed → sign out → sign in. Forgot password from login → reset link → new password → old sessions signed out. Reopen a used link: clear "can't be used" state.
2. **Discover and join**: browse starter Programs (illustrated), join one, choose a start date → the calendar fills; Program Days labelled.
3. **Do an Activity**: open today's item → Start / Pause / Resume / Finish, record metrics → completion shows on the calendar → Undo restores it. Start again creates a new attempt.
4. **Media**: from the Activity page add a photo or record a short video → processing → READY → attach to the result → view → detach (the file stays in My Media) → "Media from all attempts" lists history.
5. **Groups**: from a Program, create a group → invite by handle → the invitee sees it in notifications → accepts with the shared start date → both calendars fill independently → each sees the other's completion (never results) and can react → share a photo to the group and comment → owner removes the member: their access ends at once, their own history stays.
6. **Late joiner**: join a group whose start date has passed → earlier days read "Not participating", never missed; progress counts only from the join date.
7. **Notifications and reminders**: invitations, reactions, comments and joins appear in the inbox; reminder preferences save.
8. **Authoring**: create an Activity and a Program, publish (requires a verified email), see it in Creator Studio.
9. **Privacy**: as a second account, try another user's occurrence, session or media URL → not found.

## 3. Environment

Local (what the results above used):

```bash
pnpm install && pnpm db:local:start        # user-level MySQL 8.4.13 on :3307
pnpm db:deploy && pnpm db:seed             # migrations 0001–0005, platform catalog + media
pnpm --filter server dev                   # API :3001
pnpm --filter server worker                # worker (needs ffmpeg/ffprobe on PATH)
pnpm --filter web dev                      # web :5173
```

Live suites: commands in §1. Each creates or uses its own database (`programs_app_auth_live`,
`programs_app_history_live`, `programs_app_codex_media_roundtrip`, `programs_app_notifications_live`,
`programs_app_e2e`), creates fresh accounts, never touches `programs_app_dev`, and refuses busy ports.

Hosted UAT (Railway + Vercel + R2 + Resend) is **not provisioned**. Follow
`docs/release/poc-release-checklist.md` §3 (order), §5 (secrets, now including `CLIENT_IP_HEADER=x-real-ip`
on the API), §6 (provisioning), §7 (smoke test). Production processes refuse to start on missing or weak
configuration; `/health` is the Railway healthcheck.

## 4. Known limitations

- No demonstration videos: illustrations only (product decision pending).
- Moderation and reports: API only, no screen. Public contributions stay pending unless handled through the API.
- No Terms or Privacy pages and no account deletion: acceptable only for invite-only UAT.
- Google sign-in: API ready, no button.
- Platform illustrations are title cards, not instructional drawings.
- `.railway/railway.ts` has not been validated with `railway config plan` (no linked project yet).
- `release/p1-uat-rc` (`a2fa727`): its content (the account-switch test and `activity-media-history.live.config.ts`) was already on `main`, byte-identical. The branch is otherwise far behind `main` and can be retired. This candidate extends that config with per-client projects and the journey spec, run by `scripts/history-live.ts`.
- Two inert test accounts (`journey-author-…@test.local`, `journey-part-…@test.local`, unverified, no data) were created in the shared `programs_app_dev` by a harness run that reached another agent's API on a busy port. Runners now refuse busy ports. Delete them if the dev data should stay clean.

## 5. Hosted UAT on Railway (deployed 2026-11-08)

**URL:** https://program-guru.up.railway.app (project `program-guru`, environment `production`).
Configuration is code: `.railway/railway.ts`; `railway config plan` shows no drift.

| Service | State | Notes |
|---|---|---|
| `web` | Running `d525d69`'s build | `vite preview` of the production build; forwards `/api` over the private network; public domain targets port 3001 |
| `server` | Running `d525d69` | No public domain; `/health` checks the database; pre-deploy ran migrations `0001`–`0005` and the catalog/media bootstrap |
| `MySQL` | `mysql:8`, unchanged | Pinned in IaC (the SDK defaults to `mysql:9`) |
| `media` bucket | Railway Bucket (iad) | Seeded illustrations and uploads; uploads go through the API (no bucket CORS) |
| worker | **Not deployed** | Waits for email (Resend); see blockers |

**Single origin.** `up.railway.app` is on the Public Suffix List, so a separate API domain would be a
different site and `SameSite=Lax` session cookies would not flow. The browser talks only to the web
origin; `/api/*` is proxied to the API.

Hosted smoke test (HTTPS, public internet):
- SPA routes and deep links: 200.
- `/api/health` 200 with the deployed commit.
- 6 categories and 5 starter Programs from bootstrap.
- A seeded illustration is served from the bucket byte-identical to its manifest checksum; a range request returns 206.
- Register → `session` cookie is `HttpOnly; Secure; SameSite=Lax` on the web origin → `/auth/me` 200 → logout → 401.
- Photo upload through the API → stored in the bucket and verified on completion (state PROCESSING, waiting for the worker).

**Client IP, verified live.**
- The API's only peer for proxied requests is the web service (`fd12:3c86:6500:1:…`); the healthcheck comes from `100.64.0.1`.
- `TRUSTED_PROXY_CIDRS=fd12:3c86:6500::/48`: only this project's private network, not every private range.
- Eleven sign-ins with forged `X-Real-IP` headers hit 429 on the 11th, so forged values cannot create new identities.
- At the same moment, a second client on another network (from a Railway container, `152.55.180.144`) had its own untouched limit while ours was exhausted (`136.62.60.81`). Railway's edge overwrites `X-Real-IP` with the real client address.

## 6. Remaining blockers for hosted UAT

1. **Worker and email.** Without the worker:
   - uploads stay PROCESSING;
   - verification and password-reset emails are never sent, so new accounts stay unverified and cannot publish;
   - in-app notifications, reminders and daily summaries are not produced.

   To finish: verify a sending domain in Resend, set `RESEND_API_KEY` and `EMAIL_FROM` on a worker service (same build as `server`, start `pnpm --filter server start:worker`, `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`, the same storage and secret variables, no public domain), then add it to `.railway/railway.ts` and apply. The production gate deliberately refuses captured (unsent) email.
2. **Smoke-test accounts in the hosted database:** `uat-smoke-*`, `uat-cookie-*`, `uat-upload-*` `@example.com` (unverified; one PROCESSING photo). Remove with a targeted operation if UAT should start empty.
3. **Product decisions** in §4 for anything beyond invite-only UAT.
