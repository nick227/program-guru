# Installable PWA implementation plan

Date: 2026-11-09  
Status: Proposed; repository review completed, implementation not started.

## Outcome and scope

Make Program.Guru installable from the existing website on supported desktop and mobile browsers. The installed app uses the same React frontend, origin, session API, database, and deployment as the browser site. Users install once; future normal web releases deliver updates without downloading a new installer.

“Downloadable” means browser installation / Add to Home Screen. Native installers, app store distribution, push notifications, background synchronization, and offline mutation queues are outside this first release.

“Synced” has two separate meanings:

- **Application version:** new frontend assets arrive through the current main-branch release flow and service-worker update lifecycle. Show an update prompt and apply it when the user can safely reload.
- **Account data:** use the existing SDK and server as the source of truth. Refresh stale queries on focus and reconnect, retain current mutation invalidation, and explicitly refresh on standalone-app resume. This does not promise instant cross-device updates or synchronization while the OS suspends the app.

## Current frontend and delivery review

This is a source/configuration review of the current working tree. Hosted settings, actual response headers, install behavior, and visual rendering were not tested. Existing unrelated working-tree edits are outside this plan.

| Area | Evidence | Implication |
| --- | --- | --- |
| Frontend | `apps/web/package.json`: React 18, Vite 5, TypeScript, React Router 6, TanStack Query 5 | Add PWA support to the existing Vite build; a separate mobile frontend is unnecessary. |
| Entry point | `apps/web/src/main.tsx`, `apps/web/index.html` | No service-worker registration or manifest link. Existing theme color and favicons are a starting point. |
| Assets | `apps/web/public/` | Favicons exist; dedicated install icons and Apple touch icon are missing. |
| Routes | `apps/web/src/App.tsx` | Browser-history routes include Calendar `/`, program/workspace routes, login, invitations, and email actions. Installation and deep-link refresh must preserve routing. |
| API/session | `main.tsx`, `packages/sdk/src/client.ts`, `apps/web/vite.config.ts` | SDK sends credentials; hosted preview proxies `/api` to the server. Preserve the same-origin architecture. |
| Data freshness | `apps/web/src/lib/queryClient.ts` | Queries have a 30-second stale time and focus refetch enabled. No persistent query store is configured. Mutation retries are disabled and network mode is `always`; audit write guards before promising offline safety. |
| Offline behavior | `App.tsx`, `lib/useOnline.ts`, `lib/AuthGuard.tsx` | Existing banner says cached content is available, but that is not persistent offline data. A cold offline launch needs a deliberate screen instead of an indefinite auth loading state. `navigator.onLine` alone does not prove API reachability. |
| Unsaved work | `lib/useAutosave.ts` | Drafts use a 600 ms debounce and navigation/unload guards. An automatic reload could lose edits or interrupt uploads. |
| Mobile coverage | `apps/web/playwright.config.ts`, `docs/design/baseline/2026-11-09/README.md` | Existing desktop/mobile tests and visual baselines can support regression checks. Current mobile automation uses Chromium with device emulation; it is not real iOS coverage. |
| CI | `.github/workflows/ci.yml` | Main pushes and PRs run install, Prisma generation, types, lint, SDK checks, migrations, tests, and a **server-only** production build. No frontend production build or Playwright step currently runs. |
| Release | Root `package.json`, `.railway/railway.ts` | `pnpm release` is `git push`. Checked-in Railway source follows `main`; web builds with `pnpm --filter web build` and starts with `vite preview`. Frontend/shared/SDK/lockfile changes already match web watch patterns. |

GitHub CI and Railway source-triggered deployment are separate mechanisms in this repository. Verify live branch protection and Railway's wait-for-CI setting before claiming that failed CI blocks a release. The README still references `railway.json`; use `.railway/railway.ts` as the checked-in configuration and reconcile that documentation during implementation.

## Design decisions

### Installation

Use `vite-plugin-pwa` with a generated worker (`generateSW`) and explicit prompt-based updates. Select and lock a release compatible with the current Vite 5 / Node 20 toolchain; check peer dependencies rather than upgrading Vite as an incidental change. The plugin supports generated workers and prompt behavior. [Plugin strategy documentation](https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors).

Generate the manifest during `pnpm --filter web build` with stable `id: '/'`, `start_url: '/'`, `scope: '/'`, `display: 'standalone'`, name `Program.Guru`, short name `Programs`, and colors matching the current design. Keep identity and origin stable between releases. Add real 192×192 and 512×512 PNG icons, a dedicated maskable icon with safe padding, and a 180×180 Apple touch icon; validate actual image dimensions.

Add an accessible “Install app” entry in Settings and the account menu. Offer the browser prompt only when available, hide it in standalone mode, and provide platform-appropriate installation instructions otherwise. Do not force a prompt on first visit. HTTPS and a suitable manifest are baseline requirements; installation UI varies by browser/platform. [MDN installation guide](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Audit standalone layouts for safe-area insets, on-screen keyboards, scroll regions, dialogs, and an in-app path back from deep links. Add `viewport-fit=cover` only alongside safe-area styling. Preserve existing responsive components and themes.

### Cache and offline contract

| Resource | Planned policy |
| --- | --- |
| Build-owned HTML, hashed JS/CSS, local fonts and install icons | Revisioned precache from the production build; keep the precache limited to the app shell. |
| App document navigation | Serve the worker's coherent app shell for known SPA navigations; hosted direct requests must also support SPA fallback. |
| `/api` and all authenticated responses | Network only, excluded from worker runtime caching and navigation fallback. Check HTTP cache headers too; avoiding Cache Storage alone does not prevent HTTP caching. |
| Uploads, signed media URLs, user photos/videos, third-party URLs | No added worker cache or background replay. Preserve existing network behavior. |
| Non-GET requests | Never cache or queue. Require connectivity and surface request failures without losing local form input. |
| Missing static files, worker and manifest requests | Return proper resources/statuses, never the SPA HTML fallback. |

Do not precache URL tokens, personalized documents, or API responses. The cached shell must contain no account data. Retain only in-memory query data in phase one. After a cold offline launch, show “Connect to load your account” with retry; a warm session may retain already loaded data and must mark it stale. Revise the existing offline banner accordingly. Handle both browser-offline and server-unreachable failures without mistaking them for a 401 logout.

Audit every mutation path because `networkMode: 'always'` does not pause writes automatically. Verify logout and account switching clear account-specific query state, and check any local-storage metadata for account leakage. No persistent offline account cache is introduced.

### Update and data synchronization

1. Register the production worker once with root scope; keep it disabled in ordinary Vite development.
2. Check for updates on launch, on a throttled online/focus/visibility resume, and at a bounded interval while visible and online (initial target: hourly). Clear timers/listeners on teardown.
3. A successfully installed new worker stays waiting. Show “Update available” with “Reload to update” and “Later.” Prompt-based registration supports this lifecycle. [Plugin update documentation](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).
4. Before activation, inspect unsaved forms, debounced autosaves, in-flight mutations, and uploads. Add a shared update-safety registry covering these states; mutation count alone misses unsaved inputs. Allow saving or deferring. Never silently discard edits.
5. Coordinate open tabs/windows before sending the activation message. Do not force reload another dirty client. Handle `controllerchange` with at most one reload per safe client; test the multi-window lifecycle explicitly.
6. Keep each active client on a coherent asset set until safe activation. Use plugin-managed revision cleanup, avoid broad manual Cache Storage deletion, and verify old clients still load assets across deployment. Keep APIs compatible with older clients during rollout; deferring an update can last longer than one release.
7. Expose a non-secret build commit identifier in the UI and a small uncached version resource for diagnostics. Compare identifiers for difference, not numeric ordering, so rollback is detected too.
8. On reconnect/resume, revalidate the session and active stale data through TanStack Query. Preserve existing mutation invalidation and draft revision/conflict handling. Show an explicit refresh/retry path when synchronization fails.

Updates are eventual and depend on connectivity, browser execution, and a safe reload. A closed or suspended installed app cannot be guaranteed to update immediately after CI finishes.

## Implementation sequence

### 1. Add the PWA build and install surface

- [ ] Update `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/vite.config.ts`, and `src/vite-env.d.ts` for the compatible plugin and types.
- [ ] Add install icons under `apps/web/public/`; update `index.html` for Apple metadata and theme treatment.
- [ ] Add `src/lib/pwa.ts` (or equivalent) for registration, lifecycle cleanup, update checks, and build identity.
- [ ] Add install UI in `src/components/` and connect it to Settings/account navigation.
- [ ] Verify manifest identity, scope, icons, and standalone launch through the production build.

### 2. Add safe updates and truthful offline UX

- [ ] Implement update prompt and shared dirty/pending-work registration; integrate `useAutosave`, forms, and media upload flows.
- [ ] Add multi-client coordination and single-reload handling.
- [ ] Update `App.tsx` and `AuthGuard.tsx` for cold offline launch and reachable-server errors.
- [ ] Audit offline writes and session/query cleanup; explicitly test reconnect/resume refetch.
- [ ] Complete standalone mobile layout and navigation checks.

### 3. Extend the existing CI and deployment path

- [ ] Keep existing CI checks and server build. Add `pnpm --filter web build` after SDK generation/checks, with a same-origin `VITE_API_URL=/api` for the test artifact.
- [ ] Add an artifact validation script that fails for absent worker/manifest, invalid manifest fields, missing icons, broken asset references, or accidental API/media precache entries.
- [ ] Add `apps/web/playwright.pwa.config.ts` and a `test:e2e:pwa` script serving the built output. Install Chromium with dependencies in CI and run the PWA suite after the frontend build. Isolate it from existing dev-server tests and their caches.
- [ ] Use a local HTTP test backend for worker-controlled API requests. Browser route mocks can be bypassed by service workers; blocking workers would defeat these tests.
- [ ] Keep Railway's existing web build command: it now emits the PWA in the same `dist` directory. No independent PWA deploy job, branch, or manual version bump.
- [ ] Verify live source branch/watch patterns and wait-for-CI gating. Ensure configuration-only changes also trigger the intended deployment; include `.railway/**` in watch patterns if appropriate to the actual configuration workflow.
- [ ] Verify production headers: worker and HTML must revalidate (`Cache-Control: no-cache`); manifest/version metadata must not be held stale; hashed assets can use long-lived immutable caching. Verify worker JavaScript MIME type, root scope, HTTPS, SPA fallback, and `/api` exclusions.
- [ ] Implement required headers at the serving layer. Evaluate a small production static server with `/api` proxy if preview cannot provide the required behavior; preserve cookies, proxy paths, host validation, and the existing build/release flow.
- [ ] Update `apps/web/README.md` and release documentation with installation, update, smoke-test, and recovery instructions.

Do not add a new platform or replace CI to accomplish this. Changes to hosting configuration are part of implementation, not actions performed by this review.

### 4. Prove the lifecycle and release

| Check | Acceptance condition |
| --- | --- |
| Installation | Desktop Chromium and Android Chrome install and launch standalone; real iPhone Safari Add to Home Screen is tested manually. Unsupported browsers keep normal site access. |
| Routing/session | Calendar, program/workspace deep links, login return URLs, invitation/email routes, and expired sessions behave correctly in installed mode. External links and authentication flows are checked on real devices. |
| Offline | After a successful online load, shell opens offline; cold launch explains that account data requires connectivity. Warm stale content is labeled. Writes/uploads fail clearly without silently queued operations. |
| Cache isolation | API responses, credentials, signed media, and user content never enter worker caches. Logout/account switch cannot expose another account's data. |
| Release A → B | Build distinct A and B artifacts and switch the server at the same origin while A remains open. B is detected without reinstalling. Deferral preserves A; safe acceptance loads B once. |
| Unsaved work | Dirty editor, pending debounce, upload, mutation, and two-window scenarios do not lose work or cause reload loops. |
| Data freshness | Change server data from another client, then resume/reconnect the installed app; active data refetches and reflects the change. |
| Deployment failure | Failed worker installation leaves A usable; unavailable network does not cause repeated update prompts. |
| Rollback | Redeploy a known-good artifact on the same origin; update detection and safe activation recover the installed client without reinstalling. |

Ship all critical update/cache tests before enabling the production worker. Use the existing PR → main → Railway flow and inspect the deployed commit, headers, manifest, and worker after release. Manual device checks supplement automated Chromium tests.

For an emergency worker defect, serve a corrective worker at the same script URL/scope that removes only this application's caches and unregisters safely, then reload safe clients to the network site. Merely removing worker registration from the frontend does not remove already installed workers. Keep a recovery procedure and verify it in the lifecycle test harness.

## Completion criteria

The site installs on the agreed device matrix, uses the existing backend, survives offline launch with accurate messaging, and updates from a normal main-branch release without reinstalling or losing edits. Existing checks plus frontend build, artifact validation, and production-worker tests pass. Hosted CI gating and HTTP headers are verified, and rollback is demonstrated. Persistent offline data and background writes remain separate future work with their own conflict-resolution design.
