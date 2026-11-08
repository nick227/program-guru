# 13 — Profiles & Experience Design

**Status:** Authoritative P1 contract · **Authority:** creator-facing pages, profile layout, loading and feedback states, visual direction. Complements `01-PRODUCT.md`, `03-UX.md`, `04-UI.md`, `06-USERS.md`, `07-PROGRAMS.md`, `11-MEDIA.md`, and `12-SOCIAL.md`; domain rules stay in those documents.  
**Purpose:** Specify previously underdesigned creator-facing pages, the loading/feedback system, and the visual direction without changing the locked Calendar, Program Workspace, or Activity Page contracts.

## 1. Established constraints

- **Calendar is Home.** On normal entry, show the user's **weekly** personal calendar, combining scheduled Activities from joined Programs and standalone Activities. No persistent primary navigation is required.
- **One focus per view.** Use short labels, direct actions, low cognitive load, seeded options, button selections, intelligent defaults, and progressive disclosure. If typing is necessary, prefill a realistic editable suggestion.
- **Generic composition.** Prefer `Page`, `Stage`, `Panel`, `Card`, `Row`, `Grid`, `Stack`, semantic CSS classes, and Tailwind layout utilities. Extract behavior-rich controls only when reused. Do not add a hierarchy of domain-named visual wrappers. `Panel` contains interface sections; `Card` is a content item.
- **Calendar header** offers contextual Add Program / Add Activity and a **user widget with notification indicator** leading to profile, account activity and notifications.
- **Program Workspace is locked:** compact title/type/focus/duration/frequency header, Draft status, Edit and Calendar actions, enriched Activity rows showing instruction count/media count/metrics, Add Activity, Preview & Publish. No separate Details or Schedule sections.
- **Activity page is locked in this order:** (1) Header, (2) Today's Results, (3) Collaborators, (4) Session Controls, (5) My Metrics, (6) Related Media, (7) Community Stats (`03-UX.md` §6). Session controls support Start, Pause, Resume, Finish and Finish now. Media uses **one compact, attributed thumbnail strip**, not tabs or separate sections.
- **Universal creator capability:** any eligible user may publish Activities and Programs; a separate creator account type is unnecessary. Personal history and media are private unless deliberately shared.

## 2. Page inventory: additions and remaining surfaces

| Surface | Entry | Primary action | P1 disposition |
|---|---|---|---|
| Creator/Public Profile | Creator avatar or name on Program, Activity, media, discovery | Follow or open a Program | Design now; implement P1 |
| Own Profile | Header user widget | Edit profile / open my published content | Design now; implement P1 |
| Profile Editor | Own Profile → Edit | Save identity and visual assets | P1 |
| Creator Portfolio | Section of public profile | Open published Program / Activity / media | P1, integrated rather than separate route if possible |
| Program Storefront | Explore, profile, shared link | Join, purchase, or subscribe | P1 |
| My Program Library | User widget or contextual Add Program | Open active, created, purchased Programs | P1 (saving Programs for later is deferred) |
| Fullscreen Media Viewer | Thumbnail on Program, Activity, Instruction, Profile | View, react, navigate media | P1 |
| Notifications | User widget indicator | Open related Activity / Program / invitation | P1 |
| Subscription & Purchase Management | Own Profile → Settings / access | See entitlements, cancel/manage subscription | P1 when billing launches |
| Creator Dashboard | Own Profile → Manage → Creator Studio | Review earnings, Program enrollment/completion, approval queues; channel subscribers when P1+ contracts land | Minimal via Creator Studio (`01-PRODUCT.md` §10); richer reporting later |
| Creator Studio | Own Profile → Manage, account menu | Unified library, publishing, channel branding, audience, dashboard | P1+ API-backed subset now; Posts/collections/channel membership when contracts exist |
| Settings | Own Profile | Privacy, reminders, account, billing | P1 |
| Welcome / Initial Loading | App boot | Automatically enter weekly Calendar | P1 |
| Empty / Pending / Error / Offline | Every remote-data surface | Retry, recover or take next action | P1 |

**Routing rule:** Do not turn this inventory into a fixed tab bar. Use the Calendar as the normal starting surface; contextual links, creator identity, the Add controls, and the user widget drive navigation. Back returns to the invoking context where possible.

## 3. Creator/Public Profile: layout contract

**Intent:** A creator's profile is a combined **identity, portfolio and storefront**, not a second account type or a chronological social-feed clone.

**Top-to-bottom structure:**

1. **Cover + identity:** wide visual cover, avatar, display name, unique handle; compact Follow / Requested / Following action for visitors; Edit action for owner.
2. **Credibility line:** concise biography plus up to three Category/Focus chips **derived from the creator's published Programs** (not self-declared); avoid exaggerated labels or forced promotional copy.
3. **Compact stats:** number of public Programs and followers. Counts must be genuine and privacy-safe; never fabricate view/earnings figures.
4. **Featured Programs:** visual cards with cover, title, duration, access type/price and clear opening action. Show the six most recently published, with an unobtrusive View All when more exist.
5. **Published Activities:** compact grid or list; open the canonical Activity detail. Omit section when empty.
5a. **Achievements:** only those the creator chose to share (`09-CALENDARS.md` §9a). Omit when none.
6. **Media portfolio:** small thumbnails from public, authorized assets only; open fullscreen viewer. Omit when empty.
7. **Owner-only controls:** Creator Studio, Create Program, My Programs, My Media, Settings. Keep owner controls contextual and separate from visitor CTAs. Creator Studio hosts Analytics/Billing/Audience rather than separate admin apps (`01-PRODUCT.md` §10).

**On small screens:** full-width cover, overlapping or adjacent avatar/identity, single obvious Follow or Edit control, compact stacked program cards or two-column cards, then tiny media thumbnail grid. Avoid persistent sidebars, giant bios, or simultaneous edit fields.

**Visibility:** A user's account/profile can be private while individual content has an independently managed audience; no private content should become public simply because the profile is visible. Private follow requests require approval. Group-shared media is not automatically part of public portfolio.

### Profile Editor: one focus per view

- **Identity:** avatar, cover, display name, handle; sensible limits and uniqueness checks.
- **About:** short bio; never require long-form copy. External links and self-declared interest tags are deferred.
- **Privacy:** public/private profile, default content visibility, follower request management.
- **Preview:** view the public-facing profile before saving/publishing changes.
- Autosave a local draft when appropriate; server writes should clearly signal saved/unsaved state. Media selection opens the shared Media Studio.

## 4. Program Storefront

**Purpose:** Decide whether to join/unlock a Program with minimal scrolling and no ambiguity between purchasing, enrollment and following the creator.

**Visual hierarchy:** cover media → Program title, creator and follow affordance → focus/duration/frequency → compact Activity summary with instruction/media counts → schedule preview → participant signals/reviews if genuine → price/access → **one primary CTA** (`Join Free`, `Request Access`, `Buy Program`, `Subscribe`).

- Show previewable material without leaking locked premium content. Public listing does not imply access to private assets.
- Show one-time vs monthly price and renewal/cancellation conditions clearly before payment; use server-authoritative entitlements for access.
- On join, automatically generate editable schedule entries on the user's personal weekly calendar. Let users review scheduling conflicts; retain manual drag/drop overrides.
- If a creator publishes a new Program version, an existing participant remains pinned to their adopted version until explicitly accepting an update.
- A group invitation or friend link can land here, but joining a Program and joining a collaborative group are distinct actions.

## 5. My Program Library

**Entry:** User widget / Add Program context; not necessarily a top-level navigation destination.

**Presentation:** compact content rows or cards with Program cover, title, author, status (Active / Draft / Completed / Purchased / Saved), duration/frequency, and a single contextual action (`Open`, `Continue`, `Edit`, `Resume`, `Join`). Provide a small segmented or filter control only when the library grows; avoid multiple separate dashboards for created, enrolled and saved content.

- **Creator item** opens locked Program Workspace.
- **Participant item** opens Program Detail or related weekly Calendar context.
- **Purchased item** shows entitlement status without mixing payment state into Activity completion.
- Filter values: Active, Created (including drafts), Completed, Purchased.
- **Empty state:** direct seeded-program browsing action; avoid lengthy onboarding text.

## 6. Fullscreen Media Viewer

**Shared behavior:** Open from small thumbnail grids in Activity, Instruction, Program, Profile, or Group. Show the selected photo/video prominently with swipe/next/previous navigation; minimal creator attribution and engagement actions. The current Program creator's selected media can be featured first; other eligible public media ranked by relevance, quality and popularity. Public views/likes belong to individual assets or contributions, not automatically to every instance of an Activity.

**Always respect context:** `Mine` means private history unless explicitly published; Group media remains group-scoped; Public media is shareable/discoverable only if permission and moderation allow it. No forced tabs within Activity. Recording/Upload is available via shared Media Studio; captured media defaults private and can be published deliberately later.

## 7. Editorial practice-studio visual language

**Reference principles, not a game skin or generic dashboard:**

- **Editorial framing:** ink typography, cool stone canvas, restrained elevation, purposeful negative space, Program imagery as quiet hero on content cards.
- **Confident controls:** large hit areas, visibly selected buttons, obvious single primary action per stage, clear focus rings without requiring gamepad support.
- **Hierarchy over decoration:** minimal copy, compact metadata, strong emphasis on active status and next action; no gratuitous gradients, faux HUD, purple theme defaults, or dense status walls.
- **Progress feedback:** subtle completion confirmation, tasteful achievement reveal from real milestones, no manipulative streak pressure.
- **Responsive:** mobile-first touch interactions, desktop keyboard and pointer support, consistent maximum content width where appropriate.
- **Accessibility:** contrast and visible focus, 44px-equivalent targets when feasible, captions for instructional video, reduced motion, non-color status distinctions.
- **Motion:** short and meaningful button, panel and media transitions. Never delay a core task to play an animation.

**Design tokens are defined in `04-UI.md` §4** and implemented under `apps/web/src/styles/`. Do not invent unrelated token systems in individual pages.

## 8. Loading and feedback system

| State | Behavior | Rule |
|---|---|---|
| Initial startup | Branded, restrained full-screen splash with app mark and concise status; transition into weekly calendar | Show only during actual app initialization, never as a fixed artificial delay |
| In-page load | Skeleton matching final row/card or small inline progress indicator | Keep surrounding controls available; avoid full-screen resets |
| Background refresh | Quiet refresh indicator, preserve last confirmed content | Do not flash or reorder unexpectedly |
| Mutation pending | Disable only conflicting actions; show local progress | Prevent duplicate submits with idempotent operations |
| Success | Small confirmation and updated state; finish Activity returns to Calendar | Avoid blocking celebratory modals |
| Error | Plain error, clear Retry or Recover action; preserve entered changes | Never silently discard creator drafts or uploads |
| Empty | One focused next action, e.g. Browse Programs or Add Activity | No dense explanations |
| Offline | Explain limited capability; show cached content where available. Writes are not queued in P1: disable them with a short explanation | Do not falsely confirm server synchronization |

**Startup direction:** a short branded experience with a purposeful indicator and no fabricated progress percentage; normal data fetching uses skeletons. Respect `prefers-reduced-motion`. Avoid unnecessary sound effects, autoplay, or fake latency.

## 9. Reusable primitive composition

```tsx
<Page className="...">
  <Stage className="...">
    <Panel className="...">
      <Row className="...">{/* identity / action */}</Row>
      <Grid className="...">{/* programs or media as Cards */}</Grid>
    </Panel>
  </Stage>
</Page>
```

Use semantic CSS for surfaces, type, and controls; Tailwind for layout and responsive composition (`04-UI.md` §1b). Shared behavior controls may include `MediaPicker`, `MediaViewer`, `OptionGrid`, `EntityPicker`, `Recorder`, `FollowControl`, `AccessAction` and `LoadingState`, but avoid creating one visual component per domain row. Reuse the same surface and status conventions in creator profile, Program Workspace and Activity.

## 10. P1 acceptance scenarios

1. A new user opens the app and sees a consistent initial load followed by the weekly Calendar. There is no unnecessary splash on subsequent navigation.
2. A visitor opens a creator from a Program or media asset, sees the same identity and public portfolio, and can follow or request approval.
3. A creator edits avatar/cover/bio with the shared Media Studio and previews the result before publishing changes.
4. A visitor can distinguish free, approval-only, one-time purchase and monthly subscription access on a Program Storefront before committing.
5. A creator sees published Programs, Activities, public media and basic portfolio stats without exposing private personal logs.
6. A user opens personal or group thumbnails into the Media Viewer without accidentally publishing them.
7. Empty, loading, error and offline states have short copy, a useful action and no data loss.
8. Reduced-motion and keyboard navigation remain functional; small thumbnails provide accessible names and predictable focus order.
9. The locked Program Workspace and seven-row Activity Page remain unchanged by the new profile/visual-system work.

## 11. Decisions and remaining choices

Resolved for P1: no verified badges; no external profile links; no self-declared interest tags; Featured Programs = six most recent; Creator Dashboard uses aggregate earnings plus Program enrollment, completion, and retention, suppressed below the `12-SOCIAL.md` minimum sample; no reviews or star ratings; no saved-for-later Programs.

Still open, and not blocking implementation:

- **Brand/name polish:** product naming and marketing surfaces may still refine; the editorial practice-studio palette and type system are defined in `04-UI.md` §4. Do not equate that direction with mandatory dark mode.
- **Loading art and sound:** any branded animation or sound must be optional, short, accessible and performance-safe.

## 12. Cross-document ownership

- `01-PRODUCT.md`: P1 priorities and what is in/out of release.
- `02-DOMAIN.md`: entity ownership and invariants.
- `03-UX.md`: page routes, transitions and copy patterns.
- `04-UI.md`: visual tokens, primitives, motion and state styling.
- `06-USERS.md`: profile/auth/privacy fields and follow-approval policy.
- `07-PROGRAMS.md`: storefront access, versions, prices and publishing.
- `11-MEDIA.md`: asset ownership, selection, capture, permissions and viewer behavior.
- `12-SOCIAL.md`: audience, reactions, attribution and discoverability.
- `05-ARCHITECTURE.md`: fetching, caching, error handling, entitlement checks and asset delivery.

This document specifies the **experience and cross-page composition** only. Where an implementation rule overlaps with a domain document, keep the domain document as the authoritative source and link to it rather than duplicating schema definitions.
