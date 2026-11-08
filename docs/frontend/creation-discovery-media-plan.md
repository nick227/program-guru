# Creation, Discovery and Identity Media — Target Architecture and Plan

Status: proposal, 2026-11-08. Supersedes the priority order in `components-inventory.md` §4; that document stays the component inventory. Requirements live in `docs/specs`. §2 lists the spec amendments this plan needs before implementation.

**Priority order:** Program/Activity creation, discovery and identity media are P0. Broader component consolidation follows and reuses the patterns set here.

---

## 1. Ground truth (verified in the working tree)

| Area | Today | Consequence |
|---|---|---|
| SPA navigation | No full-page reloads: everything uses `Link` or `navigate` (the only `<a href>` is the route-error fallback). Workspace panels use `?panel=`. No route-level code splitting and no prefetching. | The SPA basics hold. The gaps are loading boundaries, state loss and prefetching. |
| "Browse suggestions to customize" | `ProgramWorkspace.tsx › ActivityPicker`: a `<details>` element with search, 4 rows, multi-select and copy-then-add. | Being replaced. Its copy-or-reference logic (`addSelected`) moves into a shared action. |
| Program Library | `ProgramLibraryDialog` is being reworked by another session into a full-screen overlay (467 lines, sort and creator filters). It is component state, not a route. | Becomes the Program mode of the shared browser. **Coordinate before touching it** (§7). |
| Discovery API | `GET /discover?kind=PROGRAM\|ACTIVITY&q&categoryId&programTypeId&focusId&accessMode&sort=RELEVANT\|NEW\|POPULAR`. Programs sort by `enrollmentCount` or `rankScore`. **Activities ignore `POPULAR`**: platform first, then title A–Z. Activities return PUBLIC + PUBLISHED only. The viewer's own Activities come from `GET /activities`. | One data source works for both browser and rail. Ranking Activities by popularity needs a server *behaviour* change (the `sort` parameter already exists). |
| Program identity image | `coverMediaId` on `UpdateProgramDraftInput`. `coverUrl` on summary, workspace and preview. **No web UI sets it.** The seed sets it to the first Activity's title card. | "Change image" for Programs needs no contract change. |
| Activity identity image | Server picks `thumbnailUrl` = first READY revision attachment whose purpose is `COVER\|ILLUSTRATION\|DEMONSTRATION`, in **attachment order**, so a later COVER loses to an earlier DEMONSTRATION. | Server fix: choose `COVER` first, then the others in that order. Behaviour only, no contract change. |
| Seed imagery | 80 CC0 "title cards": flat teal JPGs with the title text and a stale "Programs App" brand baked in. | Weak as a hero, because the text repeats the visible title. Replace them (decision B). |
| Entity media UI | Activity media is "Add media" + an attachment list, in `WorkspaceActivity` and `AddActivityPage`, using purpose `DEMONSTRATION`. Programs have no media UI. | This is the "confusing container": identity and instructional media are mixed together. |
| Occurrence page | Renders **My/Shared/Community media *before* Session Controls and Today's Results**, so the order is 1,6,7,8,4,2,3,5,9. The locked spec order is 1–9. Capture sits inside My Media → Media Library. | Existing defect against `03-UX.md` §6. Fix it in P0. |
| Pending state | `completing` and `removing` flags are shared by every calendar tile. Creation steps chain mutations with one shared `busy`. | Needs pending state per item. |

---

## 2. Spec amendments required (owner approval before code)

| # | Spec | Current text | Proposed |
|---|---|---|---|
| A1 | `03-UX.md` §3 (uncommitted edit) | "Do not place a catalog or a long list of suggestions inline in the form. Program Library search and filters live in the modal." | Allow **one row of at most 5 suggested starting points** under the type and name step, plus a `Browse Program Library` action that opens the full-screen browser (route-addressable). Search and filters stay only in the browser. |
| A2 | `03-UX.md` §7, `08-ACTIVITIES.md` §6 | "short, searchable, progressively disclosed section" of starting points | Same pattern as A1 for Activities: a top-5 rail and `Browse Activity Library`. Search lives only in the browser. |
| A3 | `03-UX.md` §4 (locked Workspace) | Header is title, type and focus, frequency | Add a **hero image with a `Change image` action** to the Workspace header. Rows and order are otherwise unchanged. |
| A4 | `03-UX.md` §6 (locked Occurrence) | Row 6 My Media: "add/upload/record" | Row 4 Session Controls gets a **compact camera action** that captures to the current attempt. Row 6 keeps the thumbnails and Add from the library. **No hero on the occurrence page:** the spec says "Do not force media into a huge hero by default", and this plan keeps that rule. |
| A5 | `11-MEDIA.md` / `08` §5 | — | Define **identity media**: one `COVER` per Activity revision and `coverMediaId` per Program. It is distinct from instructional media (`DEMONSTRATION`/`ILLUSTRATION` on instructions) and from session results media. Fallback images are presentation-only and never stored. |

Without A1–A4 the work below contradicts locked text. A5 makes the existing data model explicit and changes no contract.

---

## 3. Target structure

```
src/
  ui/                     presentation primitives, no SDK imports
    Layout, Button, Field, Input, Textarea, Select, Dialog, Popover,
    ToggleGroup, SegmentedControl, Avatar, AvatarStack, Badge, Feedback, Skeleton, Spinner
  features/
    discovery/
      DiscoveryBrowser.tsx      full-screen browser, kind = programs | activities
      SuggestionRail.tsx        top-5 rail; same data and actions as the browser
      DiscoveryCard.tsx         one card, used by both (hero + title + meta)
      useDiscovery.ts           wraps /discover (+ /activities for "mine"), normalizes to DiscoveryItem
      ranking.ts                deterministic widen-and-fallback order (§5)
      routes.tsx                nested overlay route definitions (§4)
    programs/
      ProgramCreate.tsx         owns the draft; reacts to selection
      ProgramWorkspace.tsx      layout only; panels below
      workspace/ActivitiesPanel, ScheduleEditor, PublishPreview, AddToCalendar, TitleEditor
      useProgramDraft.ts        create, copy, rename, cover; pending per action
    activities/
      ActivityCreate.tsx        one create-or-start flow, Calendar and Program contexts
      ActivityBasicsFields.tsx
      useActivityDraft.ts       create, instructions, cover; useAddActivitiesToProgram (copy-or-reference)
    media/
      EntityHero.tsx            render-only hero with fallback; sizes: card | rail | header
      ChangeImage.tsx           one action: open MediaPicker → set cover; Remove
      resolveHero.ts            the single resolution rule (§6)
      MediaGrid, MediaThumb, MediaPicker, MediaLibrary, MediaViewer, MediaCapture, AttachmentList
    occurrence/
      SessionControls.tsx       + CaptureButton (A4)
      OccurrenceMedia, OccurrenceInstructions, MetricInput
    calendar/  notifications/  account/   (from the inventory, unchanged in intent)
  lib/                      urls, dates, activityCategory, media helpers, domain types
```

Rules:
- A feature folder owns its data hooks. `ui/` never imports the SDK.
- Pages stay thin: route params → feature component.
- Barrel files are not used.

---

## 4. SPA: route-addressable browser without losing drafts

The browser is a **nested child route rendered as an overlay**. The parent create page stays mounted, so drafts, scroll and focus survive. Direct links, Back and history all work.

| Context | Parent route (stays mounted) | Browser route |
|---|---|---|
| Add Program | `/programs/new` | `/programs/new/browse?type=&focus=&q=&sort=` |
| Add Activity (Calendar) | `/add-activity?day=` | `/add-activity/browse?category=&q=` |
| Add Activity (Program) | `/programs/:id/workspace?panel=activities` | `/programs/:id/workspace/browse?panel=activities&…` |

How it works:
- **Selection.** The browser returns the result through a callback provided by the parent route's outlet context: `useOutletContext<{ onPick(item) }>()`. It then calls `navigate(-1)` when it was opened in-app, or `navigate(parent, { replace: true })` on a direct deep link. No global store is needed.
- **Direct deep link.** The parent mounts with empty draft state and the browser overlays it. Picking a result behaves the same way.
- **Loading boundaries.** Search results, the rail and each action have their own pending state. The overlay never blanks the parent.
- **Cache.** Rail and browser share query keys: the rail's first page is the browser's initial data for the same filters. `staleTime` is ≥ 60 s for catalog lookups (types, categories, focuses).
- **Prefetch.** When a create page mounts, prefetch program types, categories and the rail query. Prefetch the browser's first page on hover or focus of `Browse …`. Lazy-load the browser route chunk.
- **Optimistic updates (only where safe).** Selecting a starting point is local until Continue. Setting a cover updates the hero immediately and rolls back on error. Adding Activities to a Program stays server-confirmed, because it is revisioned (`expectedRevision`).

---

## 5. Suggestion rail: one deterministic ranking

```
rail(kind, ctx) = first 5 unique of
  1. discover(kind, { programTypeId | categoryId, focusId }, sort=POPULAR)
  2. widen: drop focusId
  3. widen: drop type/category (platform-first)
excluding: items already in the Program, locked or unavailable, the viewer's own source of the current draft
```

- Programs: works with today's API (`enrollmentCount` / `rankScore`).
- Activities: requires the server to honour `sort=POPULAR` for `kind=ACTIVITY`, ranked by a usage count (Program references or calendar items). This is a behaviour change only. Until then the rail uses platform-first + title order, which is deterministic but not "popular".
- **One action per card:** `Use as starting point` (Program) or `Add` / `Use` (Activity). The rail never edits anything. Customizing happens in the Workspace or Activity editor.
- The browser and rail call the same `onPick`. Copy-or-reference (own Activity → reference, otherwise copy with `sourceRevisionId`) lives once, in `useAddActivitiesToProgram`.

---

## 6. Identity media

**Resolution order.** This is one function, `resolveHero(entity)`, used by every surface. Server-side thumbnail selection follows the same order.

1. The entity's selected hero: `coverUrl` for a Program, the `COVER` attachment for an Activity.
2. Other eligible entity media: Activity `ILLUSTRATION` → `DEMONSTRATION`. A Program falls back to its first Activity's hero.
3. A category fallback, **rendered in CSS** from `--cat-*` tokens plus the category icon. It has no image file, is never uploaded, never appears in a library and works in both themes.
4. A neutral default (the same component with `custom` tokens).

**`EntityHero`** is render-only (`src | null`, category, alt, size). An `<img>` that fails to load falls back to step 3. It never shows a broken image.

**`ChangeImage`** is the single action. It opens the existing `MediaPicker` and then sets `coverMediaId` (Program) or replaces the revision's `COVER` attachment (Activity). Remove clears it. Preview uses `MediaViewer`. No upload or attachment logic is duplicated.

**Surfaces:** create pages, Workspace header (A3), browser cards, rails, calendar tile thumbnails. **Not** the occurrence page (A4).

**Seed.** Replace the title cards with textless images, keyed by slug in the existing checksummed manifest. Seed and bootstrap upsert them by stable id, so reseeding is safe. Programs get their own cover instead of reusing the first Activity's.

**Capture (A4).** A camera icon button in Session Controls labelled "Capture media". It attaches to the current attempt through the existing `useAttachSessionMedia`. It does not start the session timer: the existing `getSession()` creates an unstarted (READY) session when none exists, and that behaviour is kept. It never touches the hero.

**Instructional media** stays inside instructions (`OccurrenceInstructions`) and the instruction editor.

---

## 7. Stages

Each stage is a separate commit (or commits) and ends with `pnpm --filter web typecheck`, `pnpm --filter web test`, the relevant `test:e2e` specs and, for server changes, `pnpm --filter server test`.

| Stage | Work | Verification |
|---|---|---|
| 0 | Approve A1–A5. Commit or coordinate the in-flight work (ProgramLibraryDialog, seed, catalog test, untracked components). | Clean baseline: all suites green. |
| P0-a | Fix occurrence row order to 1–9. Fix hard-coded `/u/` and `/groups/` routes. Make tiles focusable. Pending state per item on tiles. | e2e journey; keyboard pass |
| P0-b | `features/discovery`: `useDiscovery`, `DiscoveryCard`, nested browser routes. ProgramLibraryDialog becomes Program mode; add Activity mode. Replace the "Browse suggestions" `<details>` with `Browse Activity Library`. Move `addSelected` into `useAddActivitiesToProgram`. | e2e: add a Program from a starting point; add Activities to a Program; deep link → pick → back keeps the draft |
| P0-c | `resolveHero`, `EntityHero`, `ChangeImage`. Program cover UI. Activity `COVER`. Server COVER-first fix (+ unit test). | Unit tests for `resolveHero`; e2e change, remove and fallback; no broken images |
| P0-d | Seed hero assets (decision B). Program covers. Reseed idempotency test. | `db:seed` twice → same ids, no duplicate MediaAssets |
| P0-e | Capture to Session Controls (A4). Remove capture from the identity container. | e2e capture → appears in My Media for that attempt; timer state unchanged |
| P1 | Suggestion rails on both create pages. Server `POPULAR` for Activities. Prefetch, lazy browser chunk, `staleTime`. Pending state per action in create flows. | Unit test for ranking/fallback; e2e rail pick |
| P2 | Remaining consolidations from `components-inventory.md` (Dialog, Popover, Field, ToggleGroup, AttachmentList, MediaGrid merge, calendar split). Moves go in their own commits. | Full suites; label and role selectors unchanged |

**Abstraction rule:** a shared component must make each consumer simpler. If adopting it adds props or branches beyond what it removes, keep the local version and document why.

## 8. Open decisions

- **B: seed imagery source.** (1) Generated original, textless illustrations (CC0, reproducible from a script). (2) Curated CC0 photographs (Openverse/Wikimedia, CC0 only, recorded in the manifest). (3) Assets you supply.
- **C: in-flight work.** Another session is editing `ProgramLibraryDialog`, `seed.ts` and `catalog.test.ts`. Wait for it, or take ownership.

---

## 9. Implementation status (2026-11-08)

Decisions: A1–A5 approved, with the occurrence structure and the compact Workspace intact. Program covers are curated CC0 photographs; Activity images are original text-free illustrations.

| Item | Status | Where |
|---|---|---|
| Occurrence rows in locked order 1–9 | Done | `pages/Occurrence.tsx` |
| Camera action beside Session Controls (private, current attempt, never starts the timer) | Done | `components/SessionCapture.tsx` |
| Canonical profile/group links | Done | `lib/urls` builders everywhere |
| Server identity image: COVER → ILLUSTRATION → DEMONSTRATION | Done | `activities/mapper.ts › pickVisual` |
| `resolveHero` + `EntityHero` (token-drawn fallback, no broken images) | Done; on storefront and profile cards | `lib/hero.ts`, `components/EntityHero.tsx` |
| `ChangeImage` + `useProgramCover` / `useActivityCover` (no capture in identity picker) | Built; **not mounted** | `components/ChangeImage.tsx`, `lib/useEntityCover.ts` |
| Activity illustrations (80, text-free, CC0 original) | Done; manifest v2 | `packages/db/scripts/generate-platform-assets.ts` |
| Program covers (23, CC0 Commons, licence re-checked at fetch, sources in manifest) | Assets done; **seed link pending** | `packages/db/scripts/fetch-program-covers.ts`, `platformProgramCover()` |
| Discover `sort=POPULAR` for Activities (usage-ranked) | Done | `social.service.ts` |
| Shared discovery source + deterministic top-5 ranking | Done | `sdk/hooks/useDiscovery.ts` |
| `SuggestionRail` / `DiscoveryCard` / card models | Built; **not mounted** | `components/SuggestionRail.tsx`, `lib/discoveryCards.ts` |
| Nested browser routes, Activity mode, replacing "Browse suggestions", rails on create pages, Workspace cover | **Blocked** on in-flight edits to `ProgramCreate`, `ProgramWorkspace`, `Activity`, `App`, `ProgramLibraryDialog` | — |
| Seed: `coverMediaId` from `platformProgramCover(slug)` | **Blocked** on in-flight `seed.ts` | — |
