# ACTIVITIES — Reusable atom, Instructions, metrics, tools, lineage

**Status:** Authoritative P1 contract · **Authority:** Activity + Instruction definitions, structured measurements, tools, seeded activity library. Actual Sessions and ResultEntries are owned by `09-CALENDARS.md`.

## 1. What an Activity is

An **Activity** is a reusable, category-agnostic action: Leg Raises, Read, Daily Check-in, Review Spending, Practice Vocabulary, Call a Friend. One Activity can be placed in any number of Programs or personal Calendars. It is independent of actual scheduling or completion. A user may create, own, and publish an Activity without creating a Program.

**Instruction** is an optional ordered part of an Activity: one brief paragraph, video, image, or enriched instruction. Most platform seeds have **1–3 instructions**, a few have none/more as content merits. An Activity with one video Instruction should display as a simple media experience, not a mandatory nested instruction list. Both Activity **and Instruction** independently support media, metric definitions, tools, and community contributions.

## 2. Content and classification model

| Entity | Main fields | Notes |
|---|---|---|
| `Activity` | id, slug? (seeds/published), creatorId? (null=platform), `canonicalActivityId?`, `sourceActivityId?`, categoryId, title, summary?, visibility, status, latestPublishedRevisionId?, timestamps | Reusable identity; customizing produces new ID with lineage |
| `ActivitySlugAlias` | id, activityId, slug, createdAt | Preserves historical activity slugs across renames |
| `ActivityFocus` | activityId, focusId | Library is browsable by Category and Focus |
| `ActivityRevision` | id, activityId, revisionNumber, titleSnapshot, summarySnapshot, publishedAt?, editorId | Immutable if published; editable draft separate |
| `Instruction` | id, instructionKey, activityRevisionId, position, title?, body? (sanitized rich text), media layout hint? | Revision-owned ordered children; no recursive nesting; `instructionKey` stays the same across revisions so contributions and media survive new revisions |
| `ActivityMetric` | id, activityRevisionId?, instructionId?, metricDefinitionId, required?, position, defaults JSON?, rollupToMetricKey? | Exactly one definition target; applies at level attached |
| `ActivityTool` | id, activityRevisionId?, instructionId?, toolDefinitionId, config JSON?, position | Declarative controls only; no executable user JS |
| `MetricDefinition` | id, key, label, valueType, unit?, precision?, aggregation?, betterDirection?, validation JSON, ownerId? | Reusable typed dictionary |
| `ToolDefinition` | id, key, label, defaultConfig JSON?, componentKey, supportedValueTypes JSON? | Approved platform control registry |

**No generic `content` field, no `variations[]`, no separately forced steps.** `summary` is brief; `Instruction.body` holds guidance where needed. Instruction title optional; if video alone explains action, body can be omitted after accessible media alt/caption.

### Planned duration and default frequency (decided 2026-11-10)

- **`Activity.durationMinutes`** (integer, 1–1440, nullable), snapshotted on each revision as `ActivityRevision.durationMinutesSnapshot`. It is the author's expected time for one occurrence. It is stored as minutes, never free text, and displayed naturally ("45 min", "1 hr", "1 hr 30 min"). It does not replace measured session time (§4) or a DURATION result metric.
- **`Activity.frequency`** (nullable), snapshotted as `ActivityRevision.frequencySnapshot`. It uses the same structured value as Programs (`FrequencyDto`: `DAILY`, `WEEKDAYS`, `N_PER_WEEK` with `n`, `FLEXIBLE`, `CUSTOM` with `offsets`, `MONTHLY`), validated the same way. It is the Activity's default when it is added to a Program, and a Program may override it per Activity (07 §7).
- Both fields are optional so existing Activities and Programs keep working unchanged. Activity create and draft-update inputs and the Activity summary and detail DTOs carry both fields.
- **`Activity.targetTime`** (decided 2026-11-10; local time of day `HH:mm`, 24-hour, nullable), snapshotted as `ActivityRevision.targetTimeSnapshot`. It is the author's suggested time. When the Activity is placed on a Calendar or in a Program without an explicit time, the new Calendar Item or schedule item takes it as its `localTime`. A time already set on an item, and any later personal change, always wins; changing `targetTime` never moves existing items. Shown in 12-hour form ("7:00 AM").

## 3. Sample Prisma-style schema


**CHECK** for exactly one target in `ActivityMetric` and `ActivityTool` (`CHECK ((activityRevisionId IS NULL) <> (instructionId IS NULL))`) and enforce uniqueness per scope/metric key in services. Community contributions are PUBLIC Media Publications in `11-MEDIA.md` §7. Consolidated persistence: `packages/db/prisma/schema.prisma`.

## 4. Metric schema and rendering contracts

Seed usable reusable metric dictionary (not workout-specific DB fields):

| Key | Type | Unit | Aggregation | Render/UX |
|---|---|---|---|---|
| `completion` | BOOLEAN | — | COUNT | checkbox/Finish; optional |
| `repetitions` | INTEGER | reps | SUM/MAX | `− 10 +` |
| `sets` | INTEGER | sets | SUM | `− 3 +` (can also be planned parameter) |
| `duration` | DURATION | seconds stored; minutes shown | SUM | timer or time entry only when measuring a separate, user-entered duration |
| `distance` | DECIMAL | selected unit (m/km/mi) | SUM | numeric + unit picker |
| `weight` | DECIMAL | kg/lb | MAX/LAST | numeric + unit picker |
| `contribution_amount` | DECIMAL | currency (user's unit) | SUM | currency amount; keep private |
| `lesson_count` | INTEGER | lessons | SUM | counter |
| `pages` | INTEGER | pages | SUM | counter |
| `rating` | INTEGER | 1–5 | LAST | segmented selection (not inherently progress) |
| `notes` | TEXT | — | NONE | optional input |

Metric definitions are **not** recommendations for health/finance outcomes. `betterDirection=NONE` when higher/lower is not intrinsically good. For measurement units, keep canonical storage + display preference and convert at API/UI boundary. Target overrides can be attached to ProgramScheduleItem and later Calendar Item; recorded value always separate.

An Activity Session's elapsed time is derived from its server-recorded start, pause/resume, and finish timestamps (`activeSeconds`). Do not ask users to fill in a second generic Activity duration field or require a DURATION result for ordinary session timing. Keep a DURATION metric only when an Activity measures a distinct duration that cannot be inferred from its Session.

**Metric precedence:** Program template suggests a target > Calendar Item personal override > explicit user log (actual). Activity-level metric declares available schema. Instruction metrics are **additional scoped inputs**, not automatically summed twice with parent metrics. If Instruction intends to contribute to a parent aggregate, declare `rollupToMetricKey` explicitly and validate compatible types/units. Display just the relevant 1–3 primary inputs initially; further metrics under `More`.

## 5. Tool contracts

| Tool key | UI | Safety / default |
|---|---|---|
| TIMER | Start/Pause/Reset; optional target | Doesn't silently finish Activity |
| COUNTER | `− / value / +` | Min 0 unless explicitly negative range |
| CHECKLIST | Compact checkboxes | Instruction checklist is not calendar completion |
| NOTES | Short expandable text | Private unless explicitly posted |
| CALCULATOR | Approved formula or simple arithmetic | No author-defined code execution |
| MEDIA_CAPTURE | Camera/upload entry | Private default, permission when used |

Tools are optional affordances. The Session Controls (start/pause/finish) are a **separate personal execution mechanism**; an instructional TIMER is not a substitute for Session state.

## 6. Create / copy / publish behavior

- Add Activity is a create-or-start flow in both Calendar and Program contexts. Lead with the new Activity form: title and category are required; summary and instructions are optional. Do not require choosing a suggestion before creating. Reuse the same Activity basics form and keep the creation action visible.
- Seeded/private/public Activities are optional starting points: at most five suggestions (most used within the category and focus, widening to the category, then all) and a `Browse Activity Library` action that opens the shared full-screen, route-addressable library browser. In the Calendar path, selecting one may prefill a private copy; users can change its title and customize the copy. In the Program path, selecting one adds it (own Activities by reference, others as a private copy). Suggestions never displace or gate creation. Do not add a separate Activity type field unless a future API contract defines one.
- An Activity's identity image is a single `COVER` attachment on its editable revision, set with `Change image`; instructional media (`DEMONSTRATION`/`ILLUSTRATION`) and session results media are separate.
- After creating the Activity basics, the Calendar path places it on the selected date and the Program path adds it to the current Program. Preserve entered values and context after placement failures so the user can retry.
- Summary optional. Enrich with buttons (`Media`, `Metrics`, `Tools`, `Instruction`) then save Private; Publish action separate. A minimal Activity with only a title and category is valid and can be enriched later.
- Edit own draft in place with revision counter. Publishing produces immutable revision ID. Editing published content creates a new draft revision and subsequently a new published version.
- `Use as is` references same Activity revision in Program. `Customize Copy` creates a new personal Activity owned by author with copied approved content and `sourceActivityId`/attribution; the original is never modified. Trying to edit something you don't own always takes this path. Do not copy media without license; may reference permitted public/seeded media as shared asset with permissions.
- Activity can be public while Program is private, and vice versa. Creator-private Activity in public Program requires a safe published snapshot/permission as defined by Programs. A public Program cannot make another person's private Activity public.
- Canonical equivalence controlled: no title-based auto-merge. Source and canonical root are different (`sourceActivityId` indicates a copy; `canonicalActivityId` means approved same exercise/action hub).

## 7. DTOs

```ts
interface ActivitySummaryDto { id:string; revisionId:string; title:string; summary:string|null;
  creator:UserSummaryDto|null; categoryId:string; instructionCount:number; mediaCount:number;
  metricLabels:string[]; visibility:'PRIVATE'|'UNLISTED'|'PUBLIC'; isFork:boolean; }
interface InstructionDto { id:string; position:number; title:string|null; body:string|null;
  media:MediaThumbDto[]; metrics:ActivityMetricDto[]; tools:ActivityToolDto[]; }
interface ActivityDetailDto extends ActivitySummaryDto { instructions:InstructionDto[];
  media:MediaThumbDto[]; metrics:ActivityMetricDto[]; tools:ActivityToolDto[];
  relatedActivityIds:string[]; canEdit:boolean; canFork:boolean; }
interface ActivityMetricDto { id:string; key:string; label:string; valueType:string; unit:string|null;
  required:boolean; defaultTarget:number|string|boolean|null; }
interface ActivityToolDto { key:string; label:string; config:Record<string,unknown>|null; }
interface CreateActivityDto { title:string; categoryId:string; focusIds?:string[]; summary?:string|null; }
interface UpdateActivityDraftDto { title?:string; summary?:string|null; expectedRevision:number; }
interface UpsertInstructionDto { id?:string; position:number; title?:string|null; body?:string|null; }
interface CopyActivityDto { sourceRevisionId:string; newTitle?:string; }
```

MediaThumbDto and media rights contracts are in `11-MEDIA.md`. Activity result DTOs are in Calendar domain. For viewer selection, use `ActivityMediaGalleryDto` with approved media publication IDs and per-item engagement, not private MediaAsset IDs.

## 8. DAO/service operations

```ts
interface ActivityDao {
  list(query:ActivityQuery,page:Page,viewerId:string|null,db:Db):Promise<PageOf<ActivitySummaryRow>>;
  getRevision(activityId:string,revisionId:string,db:Db):Promise<ActivityAggregate|null>;
  createDraft(ownerId:string,input:CreateActivityDto,db:Db):Promise<ActivityRow>;
  replaceDraftInstructions(activityId:string,items:InstructionWrite[],db:Db):Promise<void>;
  upsertMetricBindings(scope:ActivityScope,bindings:MetricBindingWrite[],db:Db):Promise<void>;
  upsertToolBindings(scope:ActivityScope,bindings:ToolBindingWrite[],db:Db):Promise<void>;
  publish(activityId:string,revision:ValidatedActivityRevision,db:Db):Promise<ActivityRevisionRow>;
  copy(sourceRevisionId:string,ownerId:string,db:Db):Promise<ActivityRow>;
}
interface MetricDefinitionDao { listForPicker(query:string,db:Db):Promise<MetricDefinitionRow[]>;
  getByKeys(keys:string[],db:Db):Promise<MetricDefinitionRow[]>; }
```

`ActivityService` validates revisions/rights and authorship; `ActivityCatalogService` powers picker/search/seeding; `ActivityMetricsService` validates typed values against definitions; `ActivityHubService` aggregates explicitly public/approved media links (using Media/Social services), not logs.

Endpoints: `GET /activities` (filters: category, focus, q, source), `POST /activities`, `GET /activities/:id`, `PATCH /activities/:id/draft`, `PUT /activities/:id/draft/instructions`, `PUT /activities/:id/draft/metrics`, `PUT /activities/:id/draft/tools`, `POST /activities/:id/copy`, `POST /activities/:id/publish`, `GET /activities/:id/public-media`, `GET /catalog/metrics`, `GET /catalog/tools`.

## 9. Seed library proposal

Strong seeded P1 set should be **quality-led and category-balanced** rather than hundreds of placeholders. The §12 inventory is 81 Activities, each with category, focus, 1–3 concise correct Instructions, a **rights-cleared illustration**, useful metric(s), tool(s), suggested difficulty/context and attribution. **Selected demonstration videos** supplement illustrations, starting with the most-used Fitness Activities and any other Activity that is hard to understand without motion. Include outliers: simple one-media instruction, text-only activity, multi-step activity with 4–6 instructions. Avoid unsafe or overprescriptive wellness/finance advice.

**Seed examples:** Leg Raises, Squats, Walk, Stretch; Vocabulary Review, Reading, Instrument Practice; Meditation, Reflection; Weekly Budget Review, Savings Contribution; Call a Friend, Plan Shared Time. All Activity content must be instructionally meaningful, accessible and rights-cleared. Platform graphics may be generic; creators can replace without duplicating source asset bytes.

## 10. Participant representation

Activity Detail/Editor is **not** the daily occurrence. Opening from Calendar uses Calendar occurrence page and pulls permitted ActivityRevision instructions as supporting content, plus personal results from session/log. If Activity has one dominant video, show thumb/inline in media strip, support swipe among 100s of approved shared demonstrations, without overwhelming Today's Results and completion controls. If there are many instructions, show ordered sequence accessible by one action. `View`/likes/comments count individual public media publications; never equate that with Activity success.

## 11. Acceptance tests

- Single video instruction needs no navigation into instruction section; Activity with no instruction remains usable.
- Activity and Instruction each attach multiple media assets, metrics, tools; scope validation prevents duplicate rollups.
- A personal copy does not change its source; private media not copied/published without permission.
- Reused Activity in 100 programs shares canonical identity; only public approved licensed media aggregates.
- Actual results and scheduling never stored on Activity or ActivityRevision.
- Metric type/unit/range validation; no hardcoded `reps` DB column; optional metric display for finance/wellness.
- Seeded library searchable, Category and Focus filters stable, default relevant picker results, attribution visible.
- Contribution attached to an Instruction survives a new Activity revision through `instructionKey`.

## 12. Initial seeded Activity inventory proposal (titles only; editorial review required)

This is the proposed **content backlog**, not a claim that scripts/media are already available. Each shipped item must have one sensible default metric, a short helpful summary, 1–3 concise instructions unless deliberately simple/complex, a rights-cleared illustration, and a recorded license and source for every asset. Each seed has stable slug, category, tags, type/focus affinity and platform provenance. Do not create separate Activity entities for difficulty levels unless materially different actions require it.

| Category | Proposed seeded titles |
|---|---|
| Fitness — strength | Squats; Leg Raises; Push-ups; Plank; Side Plank; Bird Dog; Dead Bug; Glute Bridge; Lunges; Wall Sit; Calf Raises; Step-ups; Chair Squats; Resistance Band Row; Standing Row |
| Fitness — cardio/mobility | Brisk Walk; Easy Walk; Jog Intervals; Bike Ride; Stair Walking; Warm-up; Cool-down; Neck Mobility; Shoulder Circles; Hip Mobility; Calf Stretch; Hamstring Stretch; Gentle Yoga; Balance Practice; Breathing Break |
| Education — study | Vocabulary Review; Flashcard Practice; Read a Chapter; Read for 20 Minutes; Practice Speaking; Listening Practice; Write a Summary; Solve Practice Problems; Review Notes; Complete a Lesson; Self-Quiz; Research a Topic; Practice an Instrument; Review Mistakes; Teach Back a Concept |
| Wellness | Guided Meditation; Breathing Exercise; Daily Reflection; Gratitude Journal; Set Bedtime Reminder; Evening Wind-down; Morning Routine; Outdoor Break; Mindful Walk; Stretch Break; Screen-free Break; Weekly Reflection |
| Finance | Savings Contribution; Weekly Budget Review; Categorize Expenses; Review Subscriptions; Check Monthly Bills; Update Savings Goal; Review Spending Plan; Learn a Finance Concept; Set a Spending Reminder; Organize Receipts; Plan a Purchase; Review Financial Goals |
| Relationships | Call a Friend; Plan Quality Time; Send a Check-in Message; Family Activity; Shared Meal; Schedule a Visit; Write a Thank-you Note; Listen and Reflect; Plan a Group Outing; Reconnect with Someone; Weekly Relationship Check-in; Celebrate a Milestone |

**Editorial rubric for each seed:** clear title; category and focus; appropriate nonjudgmental target; 1–3 instructions (if useful); measured metric semantics; which button/tool improves doing the task; media purpose and rights; accessible image alt/captions; ambiguity or safety concerns reviewed. For high-risk finance/wellness topics, prefer educational and organizational activities rather than personalized instructions or claims.

**Sample fully specified seeds:**

| Activity | Suggested instructions | Metrics/tools | Default media |
|---|---|---|---|
| Leg Raises | Position; Perform controlled movement; Finish/reset | Repetitions (integer), optional duration; Counter | Rights-cleared illustration plus side-view demonstration video |
| Vocabulary Review | Choose items; Practice recall; Check difficult words | Minutes (duration), optional item count; Timer/Counter | Simple word-card graphic |
| Savings Contribution | Check intended amount; Record contribution; Review cumulative goal | Currency amount, completion; Number input | Neutral financial illustration (not bank screenshot) |
| Call a Friend | Choose person; Make contact; Reflect optionally | Completion, optional duration; Quick complete/Notes | Generic connection graphic; no contact data public |
| Guided Meditation | Prepare; Follow guidance; Finish reflection | Duration, optional private note; Timer | Calm rights-cleared illustration |

Only examples may have instructional parts that differ from standard count; avoid requiring a user to follow these in sequence for completion. Content quality must be reviewed with domain expertise where applicable.
