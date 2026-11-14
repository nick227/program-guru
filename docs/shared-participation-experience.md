# Program Guru — Shared Participation Experience

**Status:** Product requirements / implementation proposal  
**Scope:** Upgrade the existing Activity participation surface, not create a separate social network or execution system.  
**Suggested repository path:** `docs/shared-participation-experience.md`

## 1. Goal

Make scheduled Activities feel social in real time. Participants should see other people joining, starting, and completing the same scheduled Activity, exchange reactions, and contribute photos or short videos. The experience stays useful with two participants or hundreds. It must still work as a normal Activity when nobody else participates.

**Core principle:** An Activity remains a reusable creator-owned definition; each user's Calendar item and Session remain personal. Shared presence and media are attached to an identifiable scheduled occurrence. Do not create a parallel Activity, completion, chat, or event-management workflow.

## 2. Consistent domain behavior

- **One creator model.** Platform/System is a creator identity, not a distinct Activity type with a separate execution pipeline. Creators retain recognition wherever their content is used.
- **Reuse indefinitely.** System or user-created Programs and Activities can be scheduled and completed repeatedly by different users.
- **Personal scheduling.** Adding another creator's Program or Activity puts it on the user's Calendar, using creator scheduling as a default; moving a personal occurrence does not modify the source definition.
- **Content ownership.** Scheduling or completing does not transfer ownership. Editing source instructions/content requires an owned copy, with source attribution retained.
- **Shared moment.** People who explicitly participate in the same scheduled occurrence can see aggregated participation and opted-in shared content. Changing a personal time must never silently claim the person is still participating at the original shared time.
- **No artificial participation.** Counts, avatars, timestamps, and media reflect real records. Scheduled is not synonymous with actively online.
- **No drip matching for POC.** Unlimited open participation works for collective remote Activities. Any small in-person gathering needs explicit capacity and real venue/host arrangements; don't imply 300 people are all meeting at one venue.

## 3. Page structure — minimal default

Keep this visual hierarchy. Avoid extra panels, activity timelines, dashboard widgets, or duplicated content.

1. **Header:** Back, Activity title, More (`···`).
2. **Creator:** Small creator identity/attribution.
3. **Activity hero:** Large, high-quality Activity image. Where media is the dominant surface, preserve a clear Activity identity without duplicating a second large hero.
4. **Schedule:** Date/time and concise relevant status.
5. **Primary Activity control:** Start / Pause / Resume / Complete, driven by actual session state. Heavy secondary actions live in More.
6. **Participation:** Real Scheduled / Active / Completed counts and a compact participant avatar rail. Avatar rings/badges indicate scheduled, active, completed; reaction badges may sit on avatars without replacing status.
7. **Shared Moments:** One dominant participant-contributed photo/video, rotating over time; compact contextual thumbnail strip; reactions; one conspicuous **icon-only camera/add-media control** near the media display.
8. **Share link:** Reserved bottom area with the **visible URL**, Copy and Share. No email invitation flow.

If there are no shared uploads, show a restrained empty media state plus Add Media. Do not fill it with fictional participant content. Hide media UI if sharing isn't allowed.

### Layout constraints

- White/light, airy, minimal-chrome, media-led; responsive mobile-first.
- Avoid gradients, glass effects, decorative pulse widgets, floating reactions, big counters beyond the existing three counts, or repeated explanation banners.
- Do not show participant avatars twice without a clear role. The upper rail shows participant state; a small avatar anchored to media identifies its contributor.
- One primary Activity button; controls for other operations stay compact or in More.
- The bottom share-link area must not be displaced by a large Add Your Moment advertisement.
- Keep useful empty/loading/error states; do not show a blank room simply because no one else is present.

## 4. Participant rail

Each participant appears as one avatar with a **separate status indicator**:

| State | Indicator | Meaning |
| --- | --- | --- |
| Scheduled | Neutral clock/ring | Joined this occurrence, not started |
| Active | Accent play/ring | Session started and not finished; **not proof of online presence** |
| Completed | Green check/ring | Finished this occurrence |

- Show a small bounded number of avatars and a `+N` overflow item; counts and overflow use real data.
- Avatar tap can open minimal participant details: display name, shared status, completion time where applicable, optional participation count and a privacy-respecting broad area only if explicitly shared.
- Reactions may appear as a small emoji on the participant avatar; do not confuse them with completion indicators.
- Preserve avatar ordering during live updates; don't constantly reshuffle the rail.
- Respect participant visibility preferences and block relationships. Aggregate counts must not expose private identities.

## 5. Shared Moments — media-led social interaction

This **replaces** the proposed Activity Stream/chat. It is not a text thread, timeline, or full gallery on initial view.

### Main media presentation

- One **dominant full-size shared photo or short video** at a time.
- Anchor every displayed media item to the contributor: small avatar, display name, and relative timestamp, in a familiar visual-message treatment (image/video **is** the message).
- Show small reaction controls/counts associated with the media item, not a second room-wide reaction feed.
- Display a thin, quiet progress bar indicating when the **next item** will appear. No unexplained Play icon for photo rotation. Video playback, if present, must have clear actual playback controls.
- Auto-advance photos after a configurable short interval (POC default: **15 seconds**, to validate with usage). Video should remain visible long enough to view, subject to a sensible maximum and manual navigation.
- Previous/Next navigation, Pause/Resume rotation, and tap-to-select a thumbnail. Manual browsing resets or pauses rotation so it does not immediately advance away.
- Auto-rotation is **per viewer**, not a globally synchronized slideshow; no real-time synchronized playback service required.
- New approved uploads join the queue without unexpectedly replacing the current media. Avoid changing the current item while the user is reacting or opening details.

### Compact artifact strip

- Directly below the dominant media: **one tiny, consolidated strip** (roughly 28–44px thumbnail scale depending on viewport), showing a couple of previous items, the current item, and upcoming ones.
- Each miniature image is **anchored to a small contributor avatar**, so it reads as a person sharing media rather than anonymous images.
- Current thumbnail subtly emphasized; previous items de-emphasized; upcoming shown normally; `+N` for remaining media.
- The strip is the **only** secondary list/preview of shared media. Do **not** also show a separate “36 moments” gallery/card, duplicate mini-stack, or another media feed elsewhere in the header.
- Hide the strip when there are too few media contributions to warrant navigation.
- `+N` can open a full grid/history view on demand, not an always-visible second gallery.

### Contribution control

- Place **one icon-only Add Media / Camera** button adjacent to the featured media or its immediate controls; accessible name such as “Share a photo or video”.
- The action opens a small choice: capture photo, choose photo, capture short video, choose video; stickers/GIFs from an approved library can be later additions.
- Review media and choose audience before publishing. Never activate a camera or publicly upload without explicit user action.
- Show upload progress and actionable errors; successful uploads enter the approved room collection when permitted. Contributors can remove their own uploads under existing content rules.
- No text message field, comments, direct messaging, or email invitation tool.

### Reactions

- Quick emoji reactions attached to **specific media items**. Optionally show the participant's current room reaction as a small avatar badge, if implemented consistently.
- Tap toggles a reaction, or select a different emoji to change it; show accurate counts from the server.
- No separate floating reaction wall, notification stream, or reaction-only panel.
- Use existing reaction primitives where applicable; enforce access and anti-spam limits.

## 6. Sharing and invitation

- Keep a dedicated **bottom share area** containing the readable occurrence URL, **Copy**, and **Share** (native share sheet when available).
- Link destination should resolve the specific scheduled shared occurrence, with Activity details and clear Join/Add-to-Calendar action; it must not ambiguously lead to a different date or anonymous Activity definition.
- Share permissions and actual audience visibility remain enforced at destination. Do not expose private meeting URLs or precise meetup locations to unauthorized visitors.
- No email invitation workflow in the POC.
- Copy success or errors use the application's existing toast system.

## 7. Lifecycle and memory

| Phase | Default behavior |
| --- | --- |
| Before scheduled time | Show real scheduled people, time, early contributions if allowed, and a clear upcoming state |
| During Activity | Participants transition scheduled → active → completed; counts and statuses refresh; media shares populate rotating view |
| After Activity | Stop treating the occurrence as live; allow review of shared media in an optional photo/video grid, serving as the **memory of that specific occurrence** |

- The memory grid is generated from the **same media collection**; it is a different presentation, not duplicate storage or another publication pipeline.
- Do not add a “Session Memory” promotional panel to the live room.
- Do not automatically publish the memory to participant profiles or publicly outside the occurrence.
- Retain attribution, audience permissions, moderation status, and removal behavior for every item.
- Do not require everyone to finish at the same instant or force a shared room “end” for personal Activity completion.

## 8. Behavior and feedback

- Session controls call existing Activity/Calendar APIs; successful state transitions update the card and avatar status.
- Use existing toasts for completed mutations, errors, Copy/Share confirmation, and Undo where supported. No premature success.
- Live participation data updates without scroll jumps, avatar shuffling, or interrupting an open media viewer.
- Provide periodic refresh for POC (e.g., poll a few seconds while visible); switch to pushed events/WebSockets only if product needs justify it.
- Distinguish active session counts from online presence; never label a user “online” solely because an ActivitySession remains ACTIVE.
- Preserve support for reduced motion. Offer manual navigation and stop auto-advancing when the user pauses, focuses interactive controls, or has reduced-motion preferences.

## 9. Engineering fit with existing schema

Current Prisma concepts already include `Activity`, `ActivityRevision`, `Program`, `ProgramEnrollment`, `CalendarItem` (with `groupOccurrenceKey`), `ActivitySession`, `ProgramGroup`, `MediaAsset`, `MediaPublication` (with `occurrenceKey`), and `MediaReaction`.

**Implementation approach:**

1. Audit the existing group occurrence-key semantics before reusing `CalendarItem.groupOccurrenceKey` for standalone Activities; existing keys identify synchronized Program occurrences and should not be conflated with local personal calendar changes.
2. Define a stable **shared occurrence identity** for a specific Activity/revision and target scheduled moment, with clear join and leave semantics. Reuse existing relationships where correct; add the smallest persistence necessary where they are not.
3. Derive Scheduled / Active / Completed counts from authoritative participation and Session records (and respect visibility/blocking). Ensure uniqueness and avoid inflated counts from multiple sessions or retries.
4. Associate eligible `MediaPublication` records with the occurrence, preserving existing media approval, audience, reactions, and asset access controls.
5. Reuse existing upload, media variant, reaction, and session mutation infrastructure; do not introduce a chat service, event bus, separate media store, or full event-management subsystem.
6. Expose a concise room API/read model: occurrence details, counts, visible participant summaries, paged approved media, contribution and reaction operations.
7. Keep real-time presentation transport independent of data semantics so polling can later be replaced without redesigning the room.

**Important:** This is a requirements document, not a claim that all APIs above are already implemented. Confirm endpoint contracts and permissions in the repo before implementation.

## 10. Safety, permissions, and content integrity

- Visibility of identity, participation status, and media must respect explicit sharing choices, blocking, and group/public access policy.
- Media goes through existing validation, moderation/reporting, and approved-audience checks; support removal and hiding.
- Rate-limit submissions and reactions, and avoid autoplaying video audio.
- For teen participants, default to privacy-preserving sharing, do not expose precise location data, and restrict unsafe/age-inappropriate public interactions.
- Maintain accessible names, keyboard navigation, screen-reader labels for status and thumbnails, focus management, and reduced-motion behavior.

## 11. POC implementation order

1. **Occurrence identity and read model:** Identify a shared Activity moment, real counts, and eligible avatar summaries.
2. **Participant rail:** Show scheduled/active/completed states and basic avatar details, connected to Session updates.
3. **Shared media:** Show one featured eligible media item and compact avatar-anchored thumbnail strip; implement local timed rotation and manual browsing.
4. **Contribution and reactions:** Add icon-only upload control, existing upload/approval flow, and media-specific reactions.
5. **Invite/share:** Visible occurrence URL, Copy, native Share; correct Join landing path.
6. **After-session grid:** Reuse approved occurrence media as a reviewable memory without a separate live panel.
7. **QA:** Test permissions, correct occurrence matching, creator attribution, rescheduling, retries/deduplication, empty rooms, hundreds of participants, mobile layout, keyboard access, and reduced motion.

## 12. Acceptance criteria

- A user can perform an Activity alone exactly as before; opening the shared room is optional.
- Two users explicitly joined to the same occurrence see consistent counts and, when allowed, each other's status updates.
- Rescheduling does not silently assign or display a user in a different shared occurrence.
- The large media item always displays contributor identity; the compact previews show tiny contributor avatars.
- Exactly **one** compact media strip appears beneath the featured item; no duplicated galleries or “moments count” preview block.
- Photos auto-advance with an unobtrusive progress indicator. Pausing and manual navigation work without jumps.
- The single Add Media control is near the featured media, not in a large promotional footer.
- Reactions belong to the current media; no chat, text composer, or extra activity feed.
- A visible, copyable, shareable **occurrence-specific URL** occupies the reserved bottom area.
- At completion, the same contribution set can be viewed as an occurrence memory grid without automatically publishing it elsewhere.
- All counts, identities, media, and statuses are authoritative, permission-checked, and accurate; no fabricated “live” presence.

## 13. Explicit non-goals (POC)

No drip matching, anonymous live presence claims, text chat, email invitations, video calls, synchronous media playback, elaborate transition animations, leaderboards, decorative activity heartbeat, separate Activity Stream, parallel Group subsystem, automatic profile memory publication, or large-scale scheduling rewrite.

14. Home Agent Implementation

Add the new discovery intent: Find something to do together, supporting Activities happening Now, Soon, or Anytime. The existing document focuses primarily on personal scheduling and Program discovery.

15. Shared Participation Experience

Clarify three details:
- Social media presentation: One dominant media contribution with contributor identity and a compact avatar-anchored thumbnail strip. Already substantially documented.
- Contribution button: One icon-only camera control alongside the media, not a separate promotional panel.
- End-of-session memory: The same media becomes a browsable grid after completion, but there should be no separate memory banner during participation.