# Programs web

Vite + React 18 + TypeScript + Tailwind, React Router, TanStack Query, and the existing `@project/sdk` client. No Shell, Card, generated CRUD pages, or browser-side backend dependencies.

## Run locally

From the repository root:

```sh
pnpm install
pnpm --filter web dev
```

The web app runs at http://localhost:5173 and expects the API at http://localhost:3001. Override `VITE_API_URL` in `apps/web/.env.local` if needed. Start the existing backend separately using its documented workflow; do not reset the database. The API must permit credentialed requests from the web origin. Use a verified local demo account to publish.

## Checks

```sh
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter web test
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

The default Playwright projects run at 1280px and 360px using mocked HTTP responses with the real SDK/hooks/router/UI. Screenshots and failure traces are ignored in `test-results/`. Mocked e2e defaults to port `5174` and does not reuse an existing Vite server (set `E2E_REUSE=1` only when you intentionally share one).

For real API verification, provide `E2E_AUTHOR_EMAIL`, `E2E_AUTHOR_PASSWORD`, `E2E_PARTICIPANT_EMAIL`, and `E2E_PARTICIPANT_PASSWORD` as environment variables; both accounts must be verified. Seed a public Program and Workout → Strength → Squats with Reps first, then:

```sh
pnpm --filter web test:e2e:live
```

The live test creates a new Program and participant enrollment via browser actions, saves a result, completes and undoes it. It never resets or accesses the database directly. Use dedicated local test accounts, not production. The test runner starts only the web server; the API must already be running. No credentials are committed.

## Foundation and remaining work

See [frontend foundation](../../docs/frontend-foundation.md) for route/state ownership, invalidation, draft concurrency, scope limits, and API dependencies. `docs/specs/` remains authoritative.

### Isolated live media round trip

Create the dedicated database with `bash scripts/local-mysql.sh create-database programs_app_codex_media_roundtrip` from the repository root. Set `MEDIA_TEST_DATABASE_URL` to that database on `127.0.0.1:3307`, using the existing local application credentials, then run:

```sh
pnpm exec tsx apps/web/scripts/media-live.ts
```

The runner starts the unmodified API and worker (3037), launches Vite/Playwright (5187), and verifies photo and video Upload → READY → Attach → Refresh → View → Detach → Refresh. It preserves the asset after detach, verifies re-selection and uses no mocks. `MEDIA_TEST_API_PORT` and `E2E_PORT` can select other unused ports. Requires local MySQL, ffmpeg, Chromium and installed workspace dependencies. Never point it at a shared/dev database; the runner rejects other database names and hosts. Processes are stopped on completion; diagnostic logs and test media remain in the printed temporary directory. Mocked browser tests and live media tests use separate artifact directories.
