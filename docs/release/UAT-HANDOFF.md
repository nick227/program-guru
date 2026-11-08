# Program Guru: UAT handoff

**Release candidate:** the commit that adds this file on `main`, directly after `11699a9`.
Local only: not pushed (`origin/main` is behind) and not deployed.

| Integrated in this candidate | Commit |
|---|---|
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
| Typecheck (all packages), lint, SDK drift, OpenAPI validation | Clean |
| Operations implemented | 155 / 155 |
| Server integration tests (`programs_app_claude_test`) | **285 / 285** |
| Web unit tests | 22 / 22 |
| Browser suite, mocked API, desktop + mobile | **90 / 90** |
| Production builds: API, worker, bootstrap bundles; web | Built |
| Live: account screens (`apps/web/scripts/auth-live.ts`) | 4 / 4 |
| Live: media upload → READY → attach → view → detach, photo and video (`media-live.ts`) | 2 / 2 |
| Live: handle invitation → ID acceptance → calendar, removal/leave revocation, reminders, preferences (`notifications-live.ts`) | 1 / 1 |
| Live: account switch isolation, Activity history (25 attempts, pagination, detach/restore, authorization) (`*.live.ts`) | 2 / 2 |
| Live: discovery → author → publish → join → Finish/Undo (`live.spec.ts`) | 1 / 1 **when run alone**; 429 when run after the history suite (see §5.1) |
| Real API + worker over HTTP: media pipeline, privacy, groups, retries, cleanup (`pnpm --filter server media:e2e`) | 19 / 19 |
| Local dev API `/health`; dev database migrations | 200; up to date |

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

Live suites (each uses its own database and ports; run **one at a time** because of §5.1):

```bash
pnpm exec tsx apps/web/scripts/auth-live.ts
MEDIA_TEST_DATABASE_URL=mysql://root:…@127.0.0.1:3307/programs_app_codex_media_roundtrip pnpm exec tsx apps/web/scripts/media-live.ts
pnpm exec tsx apps/web/scripts/notifications-live.ts
pnpm --filter server media:e2e
```

Hosted UAT (Railway + Vercel + R2 + Resend) is **not provisioned**. Follow
`docs/release/poc-release-checklist.md` §3 (order), §5 (secrets), §6 (provisioning), §7 (smoke test).
Production processes refuse to start on missing or weak configuration; `/health` is the Railway healthcheck.

## 4. Known limitations

- No demonstration videos: illustrations only (product decision pending).
- Moderation and reports: API only, no screen. Public contributions stay pending unless handled through the API.
- No Terms or Privacy pages and no account deletion: acceptable only for invite-only UAT.
- Google sign-in: API ready, no button.
- Platform illustrations are title cards, not instructional drawings.
- `.railway/railway.ts` has not been validated with `railway config plan` (no linked project yet).
- Live specs `live.spec.ts` and `*.live.ts` have no committed Playwright config on `main`. The history doc refers to `activity-media-history.live.config.ts`, which isn't committed; results above used a temporary config. `release/p1-uat-rc` (`a2fa727`) wires the account-switch test into a live suite and is **not merged** into `main`.

## 5. Blockers for hosted UAT

1. **Client IP behind a proxy.** The API does not set Fastify `trustProxy`, so behind Railway's edge proxy every request appears to come from the proxy. All testers would then share the per-IP limits: 300 requests/minute globally, 10 logins/minute, 5 password-reset requests/minute. A multi-person UAT would hit 429s within minutes. Locally this showed as one test's 429 after another suite (all traffic from `127.0.0.1`). Fix before hosted UAT: trust the platform proxy (for example `trustProxy` limited to Railway's proxy hop), then re-run the live suites back to back.
2. Infrastructure not provisioned and secrets not set (checklist §5–§6).
3. `main` not pushed; CI not yet confirmed green on GitHub.
