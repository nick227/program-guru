# Location and profile research spike

2026-11-16 · Research and implementation record. PR 1 and PR 2 are implemented locally; the proposal below records their rationale.

## Recommendation

Remove “Do it with others” and its duplicate scheduling form. Put **Add Location** beside Start now and Add to Schedule, backed by one reusable search/create modal. Extend the existing `Place` entity into a shared location directory; keep the database name and use “Location” in the interface. Add optional business information and locations to the existing user profile. An activity's linked location should lead to its associated public business profile, or to location details if no profile is linked.

Do not introduce a second activity type for activities with locations. Location is optional metadata on the same activity and scheduled occurrence models.

## What the repository establishes

| Finding | Evidence | Consequence |
| --- | --- | --- |
| The redundant section has its own date, time, Place select and Open to others checkbox. | `apps/web/src/components/activity/ActivityGatherings.tsx`; mounted by `pages/Activity.tsx` | Remove the section, not just its heading. |
| Start, Schedule, Join and participation already share a component. | `components/activity/ActivityParticipation.tsx` | Put the new action here in the full activity view; retain existing Join/Open access. Move `joinedMessage` out of the deleted section because other components import it. |
| Place is already shared by Activity, CalendarItem, CalendarRecurrence and ProgramGroup. | `packages/db/prisma/schema.prisma`, `Place` and its relations | Extend this entity; no parallel Location table. |
| Activity is the reusable definition; required dates live on CalendarItem. Time is nullable. | Prisma Activity/CalendarItem; `calendar/calendar.service.ts` | Every scheduled use has a date and time or Any. Adding a location must not require a second schedule. |
| New calendar entries inherit the activity place when omitted; explicit null means no place. | `scheduledPlace()` in `calendar/calendar.service.ts` | Preserve omitted/null/id semantics through every UI action. |
| Start reuses today's compatible item or creates one; Schedule currently passes no place. | `components/schedule/StartActivityButton.tsx`, `AddToSchedule.tsx` | Thread location through both paths, including reuse, recurrence and explicit clearing. |
| The occurrence editor returns nothing when the item has no place. | `components/activity/ScheduledPlace.tsx` | Allow Add Location on empty occurrences as well as Change/Remove. |
| Search exists, but returns all matching active places and only searches name/city. | `catalog/catalog.service.ts`, `GET /catalog/places` | Extend to address and bounded results; reuse SDK rather than load the entire directory. |
| Places require kind and source URL; address is optional. Profiles have no place or phone. | Prisma Place/UserProfile; `users/profile.service.ts` | Current schema cannot meet the requested minimum without migration. |
| Existing seeds upsert places by slug. | `packages/db/prisma/seed/writer.ts` | Useful starting point, but not a general bulk import identity strategy. |

This was repository research; no external venue provider or geocoder is needed for the proposed POC. No runtime validation was performed.

## POC 1: one location setter

The action row becomes **Start now · Add to Schedule · Add Location**. Once selected, the location name appears with Change and Remove. The modal contains:

1. A name/address search field with debounced, keyboard-accessible suggestions showing both name and address.
2. “Add a new location” when the desired place is absent. Require a name and address; use existing addressLine/locality/region/countryCode fields plus an optional postal code. Country-dependent fields need not all be mandatory. No source URL, map or geocoding dependency.
3. Use location and Cancel. No date, time, privacy or participation controls.

Use the same modal in the activity action row, occurrence view, activity authoring and profile settings. Distinguish where selection is saved:

| Context | Save behavior |
| --- | --- |
| Reusable activity page, participant | Stage a selection for the next Start/Schedule action. Show that it applies to the next scheduled use; do not silently change the public activity or create a calendar entry. |
| Start now | Pass the selection to a newly created item. If reusing an existing personal item, apply an explicitly changed selection using its version token before navigating; otherwise preserve that item's location. |
| Add to Schedule | Pass selection into the existing scheduling dialog and request. Recurrence uses the existing recurrence place field. |
| Existing occurrence | Save directly to that item with `expectedUpdatedAt`; default to this occurrence, retaining the existing explicit recurring-scope choice. |
| Author editing an activity | Set its suggested `Activity.placeId` through the existing authorized draft update. Existing calendar entries retain their own place IDs. |

Selection is tri-state: untouched = inherit, null = deliberately no location, ID = chosen location. Modal cancellation changes nothing. Creating a directory record and assigning it are separate operations; a failed assignment can be retried against the created ID. Do not show a saved occurrence until assignment succeeds.

For gathering-linked items, retain the existing explicit consequence that a personal location change leaves the gathering. Do not cause this by merely resubmitting the unchanged ID. Shared gathering changes stay in their owner-authorized update path.

### Privacy and participation boundary

The duplicate Open to others checkbox goes with the removed section; also remove the standalone Open to others CTA in `OccurrenceGathering`. Location selection never creates a gathering or changes privacy. Preserve existing gatherings, invitations, Join/Open, members and media.

The present code does **not** treat activity visibility and scheduled-instance participation as the same permission: a public exercise definition does not publish everyone's personal exercise schedule. The minimum POC removes the redundant controls while keeping that separation internally. It does not automatically convert public activities' personal calendar items into public gatherings. Existing gathering creation APIs remain, but redesigning their creation entry point or making all scheduled uses joinable is a separate participation decision, not a location prerequisite.

## POC 2: locations and business profiles

A location represents a physical place: identity, name and address. A business profile represents the person/business publishing information and activities there. They can exist independently.

Minimum relationship: **one profile can manage multiple locations; one location has zero or one associated business profile**. Implement with nullable `Place.businessProfileUserId → UserProfile.userId`; profile `locations` is the inverse relation, not a duplicated address string. Multiple tenants at one street address can be distinct named places. Shared management and multiple business associations can later use a join table.

Proposed additions/changes:

- `Place`: optional `businessProfileUserId`, `submittedByUserId`, postal code, provenance (`SYSTEM`, `USER`, `IMPORT`), optional source namespace/external ID with a composite uniqueness constraint, and a normalized name/address fingerprint index for duplicate candidates. Keep UUID as stable identity; generate slugs server-side with a collision suffix.
- Make `sourceUrl` optional and `kind` optional or default `other`. Require name/address for new submissions. Preserve existing incomplete seed records during migration rather than inventing addresses; audit them separately.
- `UserProfile`: optional business phone and website, reusing displayName and bio for business name/description. No separate account role is necessary. Present these as business profile fields, not the account's private contact details.
- Add explicit directory visibility (`PUBLIC` / `PRIVATE`) to Place. Public business locations enter suggestions automatically on save; personal/private addresses remain available only to their submitter and must not leak through public activity responses. Public activity defaults can only select public locations. Reuse existing `isActive` for removal from selection.

Saving a new public business location from profile settings creates the Place and profile association transactionally, so it immediately appears in the same search as seeded and community-submitted locations. A user adding an arbitrary place to an activity is its submitter, not its business owner. Selection of an existing place does not grant editing rights or attach it to the selector's profile.

For this POC, newly created business places can be linked to the creating profile as a self-declared association, with no verified badge. Linking an existing unowned/imported place requires an administrator to associate it; do not let a search selection claim an existing business. Duplicate candidates should prompt reuse; ambiguous matches are not merged automatically. The directory must support unclaimed locations from day one.

Return a small authorized `businessProfile` projection in the shared Place DTO (handle, display name, profile URL). Populate in batches/includes to avoid one query per location. Render a profile link only when that profile is public and accessible under existing block/status rules. Otherwise show location details without exposing private profile fields. Public business phone, website and bio appear on the profile. Do not hardcode a profile handle into Place: handle changes should resolve through the relation.

Removing a profile association leaves the Place and activity links intact. Deactivating a Place removes it from suggestions but retains historical references. Profile association does not mean the business hosts every activity that mentions the location; only an activity authored by the associated account can make that assertion in this POC. Replace current blanket “nothing here is hosted” copy with accurate per-activity attribution.

## API and implementation sequence

1. Update canonical specs first: 03 UX, 06 Users, 08 Activities/Places, 09 Calendar, 10 Collaboration and relevant 12/13 discovery/profile wording. Current specs explicitly defer user-created Places and require the redundant gathering form. This proposal records the intended amendment; it does not silently change those requirements.
2. Add the backward-compatible Place/profile migration and server validation. Extend `GET /catalog/places` with address search and pagination (default 10, maximum 25); preserve existing response compatibility or update all consumers together. Bound query length and filter visibility before pagination. At POC scale SQL matching suffices; measure before choosing a dedicated search engine.
3. Add authenticated `POST /catalog/places` with repeat-safe creation and profile location management operations with ownership checks. Keep business association server-controlled. Extend profile writes/reads and the shared Place DTO, OpenAPI, SDK types and cache invalidation.
4. Implement the shared modal and all assignment paths above. Remove the duplicate section and occurrence CTA; retain helpers used by participation and invitations. Update PlacePreviewDrawer and ScheduledPlace for optional source URLs and business links.
5. Demonstrate both tasks with one end-to-end journey and focused API regression tests.

Bulk import is not required to prove these two tasks. Prepare for it now with stable IDs, provenance and unclaimed places. A later admin importer should validate the same create rules, offer dry-run/error rows, upsert by `(sourceNamespace, externalId)`, preserve community/owner edits and never attach imported locations to arbitrary users. Address fingerprints identify candidates, not authoritative identity; different businesses share addresses. No Yelp integration, reviews, booking, maps, hours or taxonomy expansion is required for this POC.

## Acceptance evidence required for implementation

- The duplicate section and Open to others controls are gone; Start and scheduling retain their date/time-or-Any behavior, with and without a location.
- Select an existing place and create a new name/address place; both persist through Start, Schedule and recurrence. Explicit removal does not accidentally re-inherit the activity default.
- Start reuses a compatible existing item without duplicating it. Editing location on an empty occurrence works. Modal cancellation, conflicts and failed saves behave correctly.
- Business A saves a public location in profile settings. User B finds it in suggestions, schedules an activity there and follows its location link to A's profile and business information.
- An unclaimed community place first opens location details; after administrator association, the same activity opens its business profile without rewriting the activity.
- A user cannot edit another business's place, claim it by selecting it, expose a private address/profile, or automatically publish a personal occurrence through a public activity.
- Existing gatherings and their Join/Open flow still work. Personal location edits preserve the documented membership consequence. Existing seed records and links survive migration.
- Run migration validation, OpenAPI/SDK consistency, typecheck, focused server tests and browser tests covering the above. Research-only changes do not need application tests.

The implementation should be two reviewable slices: location action/modal with end-to-end assignment, then profile-backed creation/search/linking. Both slices together are the minimum complete POC for the requested experience.


## PR 2 implementation notes

- Manage business phone, website and associated locations at `/settings#business`; public profiles show the contact information and active associated locations. The activity editor can set a public suggested location using the shared modal.
- The shared location modal searches name/address with pagination, can create public directory entries or private personal addresses, and keeps creation separate from assignment. Public Places do not expose the submitting user's identity.
- `POST /catalog/places` creates a repeat-safe submission. `linkToMyBusiness: true` links a newly created public location to the current profile atomically. Selecting an existing result never claims it. Exact duplicate candidates return 409 so the user can select the existing result.
- `PATCH /catalog/places/{placeRef}` accepts a UUID and `expectedUpdatedAt`, with owner-only field edits, deactivation or `unlinkBusiness`. It never accepts a new owner or directory visibility change.
- `PATCH /admin/places/{placeId}/business` is ADMIN-only, accepts `{ businessProfileUserId: UUID | null, expectedUpdatedAt }`, and records old/new association and actor in `PlaceAssociationAudit`. There is no claim/verification or admin association UI in this slice.
- Private addresses can only be used by their submitter on personal calendar entries. Activity suggestions and shared gatherings accept public Places only. Making a profile private hides business contact and profile links; a public directory location itself remains public.
- Migrations `20261116120000_location_profiles` and `20261116121000_place_association_audit` are additive and applied locally. Existing location IDs, incomplete seed addresses, activities and calendar references are preserved. Prisma's datasource/schema comparison reports no drift.
- Optional provenance/source identity fields prepare for later imports. Bulk-import UI, verification, maps, geocoding, opening hours and multi-owner permissions remain deferred. The legacy Browse city shortcut uses the first 25 public places; the location setter itself uses paginated server search and can reach the full directory.
- Verification: 20 desktop/mobile location browser cases, 19 focused location API cases, affected user/activity/calendar/gathering/discovery regressions, workspace typechecks, server lint, OpenAPI lint and SDK/handler consistency checks. OpenAPI retains the pre-existing `/groups/live` missing-4XX warning.
