# `apps/web/src/components` — Inventory and Consolidation Proposal

Status: analysis, 2026-11-08. Covers the working tree, including uncommitted files (`ActivityTile`, `ActivityBasicsFields`, `ProgramLibraryDialog`, `ui/DayProgressBar`, `ui/SegmentedControl`). This document proposes implementation changes only. Requirements stay in `docs/specs/01–13`, and nothing here changes the locked layouts (`03-UX.md` §2, §4, §6).

**Totals:** 38 files, 4,162 lines. 22 domain components (3,180 lines) and 16 `ui/` primitives (982 lines). Pages (`src/pages`, 7,119 lines) are the main consumers.

---

## 1. Inventory

### 1.1 `ui/` primitives

| File | Lines | Exports | Used by | Notes |
|---|---:|---|---|---|
| `ui/Layout.tsx` | 47 | `Page`, `Stage`, `Panel`, `Row`, `Grid`, `Stack` | ~40 files | The layout system the project requires (`04-UI.md`). Healthy. |
| `ui/Button.tsx` | 46 | `Button`, `ButtonProps` | ~37 files | Uses `cva` over `.btn` CSS classes. Doesn't export `buttonVariants`. |
| `ui/Feedback.tsx` | 46 | `ErrorMessage`, `Loading` | ~37 files | Renders the API error shape (`fieldErrors`, `requestId`). |
| `ui/Input.tsx` | 48 | `Input` | 17 files | Optional voice input. Always calls `useSpeechRecognition` and always adds a wrapper `div`, even when `voice` is off. |
| `ui/Textarea.tsx` | 64 | `Textarea` | `ui/Form` only | Voice input with append mode. `ActivityBasicsFields` uses a raw `<textarea class="textarea">` instead. |
| `ui/Select.tsx` | 13 | `Select` | `ActivityBasicsFields`, `ProgramWorkspace` | 9 other raw `<select>` elements carry their own classes (`ProgramGroups`, `Settings`, `Group` ×2, `studio/*` ×5). |
| `ui/Form.tsx` | 133 | `Form`, `FieldConfig` | `Login`, `Auth` | Schema-driven auth form. The Input and Textarea branches repeat the same aria/error wiring. |
| `ui/Avatar.tsx` | 44 | `Avatar` | 8 files | Initials fallback. A double space in a name produces an empty initial. |
| `ui/Spinner.tsx` | 27 | `Spinner`, `PageSpinner` | `Button` | Nothing uses `PageSpinner`. |
| `ui/Skeleton.tsx` | 13 | `Skeleton` | `Feedback` | |
| `ui/SegmentedControl.tsx` | 68 | `SegmentedControl` | `Calendar` (view switch) | *Untracked.* `role="radiogroup"` without arrow-key handling or roving tabindex. |
| `ui/DayProgressBar.tsx` | 116 | `DayProgressBar` | **none** | *Untracked.* Repeats `ActivityTile`'s status glyphs and Group badge. |
| `ui/EmptyState.tsx` | 31 | `EmptyState` | **none** | Pages write empty states inline. |
| `ui/Card.tsx` | 9 | `Card` | **none** | CLAUDE.md says "No `Shell` or `Card`". `styles/components/card.css` is dead with it. |
| `ui/voice/useSpeechRecognition.ts` | 101 | hook | `Input`, `Textarea` | |
| `ui/voice/VoiceButton.tsx` | 36 | `VoiceButton` | `Input`, `Textarea` | |

### 1.2 Domain components

| File | Lines | Exports | Used by | Responsibility |
|---|---:|---|---|---|
| **Calendar** | | | | |
| `CalendarSurface.tsx` | 386 | `CalendarSurface`, `SurfaceItem`, `CalendarDay` | `Calendar`, `ProgramWorkspace` | Day, week and month views. Contains the internal `DayItems` list. |
| `ActivityTile.tsx` | 482 | `ActivityTile`, `ActivityTileItem`, `ActivityTileDensity` | `CalendarSurface` | *Untracked.* Pill and card densities, category theming, complete/remove menu. |
| **Media** | | | | |
| `MediaGrid.tsx` | 88 | `MediaItem`, `MediaGrid`, `MediaVisual` | `MediaLibrary`, `ThumbnailGrid`, `ActivityMediaHistory` | A thumbnail button (`MediaItem`) and a selectable grid. |
| `ThumbnailGrid.tsx` | 64 | `ThumbnailGrid`, `Thumb` | `Profile`, `OccurrenceMedia`, `OccurrenceInstructions` | A second grid of `MediaItem` with an "add" tile and fixed column counts. |
| `MediaLibrary.tsx` | 163 | `MediaLibrary` | `MediaPicker`, `MediaStudio` | Source and type filters, search, upload, capture, grid. |
| `MediaPicker.tsx` | 111 | `MediaPicker` | `Activity`, `ProgramWorkspace`, `OccurrenceMedia`, `ActivityMediaHistory` | Sheet dialog around `MediaLibrary`. Selects one item, with a dedupe check against existing attachments. |
| `MediaCapture.tsx` | 93 | `MediaCapture` | `MediaLibrary` | File input using the device camera. Has its own dialog, or a hand-rolled focus trap when it's already inside one. |
| `MediaViewer.tsx` | 150 | `MediaViewer`, `ViewerItem` | 5 files | Full-screen lightbox with keyboard navigation and signed-URL delivery. |
| `MediaAttachments.tsx` | 90 | `MediaAttachments` | `Activity`, `ProgramWorkspace`, `OccurrenceMedia` | Lists, views and detaches the links for one target. |
| `ActivityMediaHistory.tsx` | 349 | `ActivityMediaHistory` (+ internal `ResultMedia`, `EmptyAttempt`, `AttemptMedia`) | `OccurrenceMedia` | Media across every attempt. `ResultMedia` is a superset of `MediaAttachments`: it adds a thumbnail, undo after detach, and attach. |
| `OccurrenceMedia.tsx` | 193 | `OccurrenceMedia` | `Occurrence` | The occurrence page's media sections: Your / Shared / Community. |
| **Activity and occurrence** | | | | |
| `ActivityBasicsFields.tsx` | 80 | `ActivityBasicsFields` | `Activity`, `ProgramWorkspace` | *Untracked.* Controlled fields for title, description, category and instructions. |
| `OccurrenceInstructions.tsx` | 92 | `OccurrenceInstructions` | `Occurrence` | Pages through instructions and opens their media. |
| `MetricInput.tsx` | 82 | `MetricInput` | `Occurrence` | Boolean, text and numeric stepper inputs for recording a metric. |
| **Programs** | | | | |
| `ProgramGroups.tsx` | 170 | `ProgramGroups` | `Program` | Lists and creates groups for a Program version. |
| `ProgramLibraryDialog.tsx` | 157 | `ProgramLibraryDialog` | `ProgramCreate` | *Untracked.* Program discovery modal with type filter. |
| **Notifications and account** | | | | |
| `AccountMenu.tsx` | 239 | `AccountMenu` | `App` | Bell popover with recent notifications, plus the account `<details>` menu. |
| `NotificationRow.tsx` | 126 | `NotificationRow` | `AccountMenu`, `Notifications` | |
| `UnreadDot.tsx` | 46 | `UnreadDot` | 4 files | Count badge or dot. |
| `UpcomingRemindersPanel.tsx` | 98 | `UpcomingRemindersPanel` | `Notifications`, `Settings` | Next 7 days of reminders. |
| **Shared** | | | | |
| `AvatarStack.tsx` | 41 | `AvatarStack` | `Occurrence`, `ActivityTile` | |
| `Navigation.tsx` | 20 | `Back`, `linkButton` | ~23 files | `linkButton` is the literal string `'btn btn--outline'`. |

### 1.3 Dependency sketch

```
CalendarSurface ─▶ ActivityTile ─▶ AvatarStack ─▶ ui/Avatar
                               └▶ UnreadDot
OccurrenceMedia ─▶ ThumbnailGrid ─▶ MediaGrid.MediaItem
               ├▶ MediaAttachments ─▶ MediaViewer
               ├▶ ActivityMediaHistory ─▶ MediaItem, MediaPicker, MediaViewer
               └▶ MediaPicker ─▶ MediaLibrary ─▶ MediaGrid, MediaCapture
AccountMenu ─▶ NotificationRow, UnreadDot, Navigation.linkButton
```

---

## 2. Findings

### 2.1 Dead or contradictory code
- `ui/Card.tsx` and `styles/components/card.css` contradict the "No `Card`" rule and nothing uses them.
- `ui/EmptyState.tsx`, `PageSpinner`, the `'timeblock'` density value in `ActivityTileDensity`, and the `CategoryStyle` type in `lib/activityCategory.ts` aren't used anywhere.
- `ui/DayProgressBar.tsx` isn't used. It's untracked, so it may be work in progress. Either wire it in or remove it.

### 2.2 Duplicated types and logic
- **`SurfaceItem` (CalendarSurface) and `ActivityTileItem` (ActivityTile) are field-for-field identical.** The only difference is `category: string` vs `ActivityCategory | string`.
- The completion check `item.done || item.status === 'DONE'` appears 4 times across the two files.
- Status glyphs (check, pending ring, lock) and the "Group" badge exist in both `ActivityTile` and `DayProgressBar`. The two copies already differ: one Group badge uses `text-cat-relationships`, the other `text-rose-400`.
- The attachment status label (`mediaDeleted ? ' · deleted' : state !== 'READY' ? …`) is repeated in `MediaAttachments` and `ActivityMediaHistory`.
- Viewer-item mapping: `OccurrenceMedia.toViewer` exists, `OccurrenceInstructions` builds the same array twice inline, and two callers pass a no-op `onIndex={() => {}}` to show a single item.
- About 30 `pages.flatMap((p) => p.data)` calls across components and pages flatten infinite queries. The pattern "`<ErrorMessage retry>` + `isPending ? <Loading/> : empty ? … : list` + Load more button" repeats about 15 times.

### 2.3 Parallel implementations of the same thing
| Concern | Implementations | Gap |
|---|---|---|
| Media thumbnail grid | `MediaGrid`, `ThumbnailGrid` | Both render `MediaItem` in a CSS grid. One handles selection, the other has an add tile and set column counts. |
| Attachment list | `MediaAttachments`, `ActivityMediaHistory › ResultMedia` | `ResultMedia` does everything the other does, plus thumbnail, undo and attach. `OccurrenceMedia` renders **both** for the current attempt ("Manage attachments" and the history with the current attempt open by default). |
| Modal dialog | `MediaViewer`, `MediaPicker`, `MediaCapture`, `ProgramLibraryDialog` | Each one repeats `useMediaDialog()`, `onCancel` + `preventDefault`, and a long class string. The hook's name says "Media" but `ProgramLibraryDialog` uses it too. |
| Popover / menu | `AccountMenu` bell (hand-written Escape and outside-click listeners), `AccountMenu` `<details>`, `ActivityTile` manage menu (neither) | Three mechanisms, and two of them are in one component. The tile menu doesn't close on Escape or outside click. |
| Toggle group | `SegmentedControl`; Buttons with `aria-pressed` and variant switching in `MediaLibrary` (×2) and `ProgramLibraryDialog` | No shared chip-group primitive. |
| Labelled field | `<label className="field"><span className="label">` (ActivityBasicsFields, ProgramLibraryDialog), `<label className="space-y-2">` (ProgramGroups), bare `<label>` (MediaLibrary, MediaCapture), `Form` | No `Field` primitive, so spacing and error placement vary. |
| Select / textarea | `ui/Select`/`ui/Textarea` vs raw elements | See §1.1. |

### 2.4 Styling drift
- `ActivityTile.CATEGORY_THEME_STYLES` hard-codes Tailwind palette colours (`emerald-500`, `teal-400`, `purple-500` …). The project already defines `--cat-*` tokens in `styles/tokens/categories.css`, with dark overrides, and exposes them as `cat.*` in `tailwind.config.ts`. The hard-coded values don't match the tokens. For example, wellness is `152°` green in the tokens but teal in the tile. The fixed `-400` and `-300` shades also skip the dark-theme overrides.
- `linkButton = 'btn btn--outline'` is a second, untyped copy of the Button variant.

### 2.5 Correctness and accessibility found during inventory
- **Hard-coded routes bypass `lib/urls`** (friendly-URL work in `ff21ea1`). `NotificationRow` uses `` `/u/${handle}` ``. `ProgramGroups` uses `` `/groups/${id}` `` in the `Link`, even though it imports `buildGroupUrl` for `navigate`. Pages do the same (`Group`, `Occurrence`, `MediaPublication`, `Settings`).
- `ActivityTile` and `DayItems` fall back to `<div onClick>` when an item has no `href`. Those divs aren't focusable and don't respond to the keyboard.
- `ActivityTile` builds `AvatarStack` people with placeholder names ("Group participant", "Collaborator"), so its `aria-label` reads "Group participant, Group participant, …".
- `UnreadDot` puts `role="status"` on every instance. A month view with many tiles creates many live regions.
- `CalendarSurface` re-filters `items` by day up to 3 times per day per render (strip, board, `DayItems`), which is O(days × items) each time. One `Map<dayId, items>` built per render would replace it.
- `onComplete`, `onRemove`, `completing` and `removing` are passed through `CalendarSurface → DayItems → ActivityTile` at 5 call sites. `completing`/`removing` are global flags, so every tile shows as disabled while any one tile mutates.

---

## 3. Proposed structure

Group by domain, so the root holds only shared composites:

```
components/
  ui/                       primitives, no SDK imports (except Feedback's ApiError)
    Layout.tsx  Button.tsx  Field.tsx*  Input.tsx  Textarea.tsx  Select.tsx
    Dialog.tsx*  Popover.tsx*  ToggleGroup.tsx*  SegmentedControl.tsx
    Avatar.tsx  AvatarStack.tsx  Badge.tsx* (UnreadDot)
    Feedback.tsx (+ QueryState*, LoadMore*)  Skeleton.tsx  Spinner.tsx
    Back.tsx (from Navigation)  Form.tsx  voice/
  calendar/
    CalendarSurface.tsx  MonthView.tsx*  WeekView.tsx*  DayView.tsx*
    ActivityTile.tsx  TileStatus.tsx* (glyphs + Group badge)  DayProgressBar.tsx
    types.ts* (CalendarItem, CalendarDay, isItemDone)
  media/
    MediaThumb.tsx (was MediaGrid.MediaItem)  MediaGrid.tsx (merged with ThumbnailGrid)
    MediaLibrary.tsx  MediaPicker.tsx  MediaCapture.tsx  MediaViewer.tsx
    AttachmentList.tsx* (merged MediaAttachments + ResultMedia)
    AttemptMediaHistory.tsx (was ActivityMediaHistory)
  occurrence/
    OccurrenceMedia.tsx  OccurrenceInstructions.tsx  MetricInput.tsx
  activity/
    ActivityBasicsFields.tsx
  program/
    ProgramGroups.tsx  ProgramLibraryDialog.tsx
  notifications/
    NotificationRow.tsx  UpcomingRemindersPanel.tsx  NotificationsPopover.tsx*
  account/
    AccountMenu.tsx
```
`*` = new file created by a consolidation below. Each folder exports from its own files. Skip `index.ts` barrels: Vite tree-shakes either way, and explicit paths keep `grep` useful.

---

## 4. Consolidations, by value

### P1: low risk, high leverage
1. **Delete dead code:** `ui/Card` + `card.css`, `ui/EmptyState` (or adopt it, see 8), `PageSpinner`, the `'timeblock'` density, `CategoryStyle`.
2. **One calendar item type.** Move `ActivityTileItem` to `calendar/types.ts` as `CalendarItem`, delete `SurfaceItem`, and add `isItemDone(item)`. `Calendar.tsx` imports `SurfaceItem` once.
3. **Fix route builders.** Replace every `` `/u/…` `` and `` `/groups/…` `` template with `buildProfileUrl` / `buildGroupUrl`. Consider a lint rule (`no-restricted-syntax` on those template prefixes) when ESLint lands for the Phase 5 gate.
4. **Export `buttonVariants`** from `ui/Button`. Define `linkButton` as `buttonVariants({ variant: 'outline' })`, or add a `LinkButton` component, and move `Back` into `ui/`. `Navigation.tsx` goes away.
5. **Category colours come from tokens.** Replace `CATEGORY_THEME_STYLES` with one class set driven by a CSS variable: in `calendar.css`, write `.tile[data-category="fitness"] { --cat: var(--cat-fitness) }`, and have the tile use `hsl(var(--cat) / 0.1)` and similar. Move `CategoryIcon` into `lib/activityCategory.ts`, or into `calendar/TileStatus.tsx` as `CategoryBadge`. This also gives dark mode for free.

### P2: merges
6. **`MediaGrid` + `ThumbnailGrid` → `media/MediaGrid`** with props `{ items, onSelect?, onAdd?, addLabel?, columns?, empty?, selection?: { selected: string[]; selectableWhen?: (a) => boolean } }`. Three ThumbnailGrid callers and one MediaGrid caller to update.
7. **`MediaAttachments` + `ResultMedia` → `media/AttachmentList`** with props `{ context, target?, readOnly?, allowAttach?, allowUndo?, showThumbs? }`. `ActivityMediaHistory` keeps only the attempt grouping. Then drop OccurrenceMedia's separate "Manage attachments" block: the history already opens the current attempt. Check that against `08-ACTIVITIES.md` and `docs/frontend/media-system.md` first, because it removes a visible control.
8. **`QueryState` and `LoadMore` primitives** in `ui/Feedback`:
   ```tsx
   <QueryState query={links} empty="No attachments.">{(rows) => …}</QueryState>
   <LoadMore query={links} label="More attachments" />
   ```
   Add `flattenPages(query)` (or a `select` in the SDK hooks) to replace the ~30 inline `flatMap`s. `EmptyState` becomes the `empty` renderer.
9. **`ui/Dialog`** wraps the native `<dialog>`. Rename the hook to `useModalDialog`. Props: `variant: 'sheet' | 'fullscreen' | 'centered'`, `label`, `onClose`, `dismissible`, where `dismissible` covers MediaPicker's busy guard. Used by MediaViewer, MediaPicker, MediaCapture and ProgramLibraryDialog. `MediaCapture`'s hand-written focus trap stays only for the nested-in-picker case. Or render capture as a step inside the picker's dialog and delete the trap.
10. **`ui/Popover`** built on the native `popover` attribute, or one shared outside-click + Escape hook. Split `AccountMenu` into `NotificationsPopover` (bell) and the account menu. Use the same primitive for `ActivityTile`'s manage menu, which gives it Escape and outside-click closing.
11. **`ui/ToggleGroup`** for wrapping filter chips: MediaLibrary source and type, ProgramLibraryDialog type. Keep `SegmentedControl` for 2–4 fixed options and add arrow-key navigation. ⚠ e2e uses `getByRole('button', { name: 'All types' })`. A toggle group of `aria-pressed` buttons keeps that role. Switching to radios would break it.
12. **`ui/Field`** (`label`, `hint`, `error`, `children`). Adopt it in ActivityBasicsFields, ProgramGroups, ProgramLibraryDialog, MediaLibrary and `Form`. Switch the raw `<select>` and `<textarea>` elements to `ui/Select` and `ui/Textarea`. ⚠ Keep label text exact: e2e selects by label ("Activity title", "Description (optional)", "Group name (optional)", "Search media", "Photo or video", …).

### P3: decomposition
13. **Split `CalendarSurface`** (386 lines) into `MonthView`, `WeekView` and `DayView`, sharing a `DayButton` (one aria-label builder instead of three) and a per-render `itemsByDay` map. Replace the four threaded action props with `actions?: { complete?, remove?, pendingId? }`, so only the tile being mutated is disabled.
14. **Slim `ActivityTile`** (482 lines). Make one `TileShell` that renders either `Link` or `button`, which fixes the `<div onClick>` keyboard gap, and have the pill and card bodies render inside it. Move the status glyphs and Group badge into `TileStatus`, which `DayProgressBar` reuses. Pass real participant names (or `aria-hidden` the stack) instead of placeholders.
15. **`MediaViewer` single-item mode:** make `onIndex` optional and hide the prev/next controls when `items.length === 1`. Add `toViewerItems()` to `lib/media` (or a `useMediaViewer()` hook returning `{ open, element }`) to remove the three viewer state machines in OccurrenceMedia, OccurrenceInstructions and ActivityMediaHistory.
16. **Primitive hygiene:** `Input` and `Textarea` call the speech hook and add the wrapper only when `voice` is set (split into a `VoiceInput` wrapper). `UnreadDot` drops `role="status"` from per-tile badges and keeps one live region in the header. `Avatar` initials filter out empty segments.

### Out of scope
- Page decomposition (`ProgramWorkspace` 1,211 lines, `Group` 1,076). Those pages hold 7 and 3 inline sub-components respectively and deserve their own inventory.
- Anything that changes the Program Workspace layout, the nine-row Activity page, or the calendar-first rule.

---

## 5. Suggested order and verification

| Step | Items | Expected diff | Gate |
|---|---|---|---|
| 1 | P1 (1–5) | −~150 lines, moves | `pnpm --filter web typecheck`, unit tests, e2e journey |
| 2 | Folder moves (§3) | imports only | typecheck; do it in a separate commit so history stays readable |
| 3 | P2 (6–9) | −~300 lines | e2e media and calendar flows; manual check of picker dedupe and undo detach |
| 4 | P2 (10–12) | ±0, behaviour fixes | e2e label and role selectors unchanged; keyboard pass on menus and dialogs |
| 5 | P3 (13–16) | −~200 lines | visual check of day/week/month at phone width; screen-reader spot check |

Commit the five untracked components before step 1, so the moves keep their history.
