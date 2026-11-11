# CALENDARS — Personal scheduling, occurrences, sessions, results

**Status:** Authoritative P1 contract · **Authority:** Calendar ownership, recurrence/materialization, schedule modifications, Activity occurrence UI state, result logging. Template definitions belong to `07-PROGRAMS.md`.

## 1. Core decision

**Each user owns their calendar.** In P1 the calendar is the set of Calendar Items and Recurrences owned by the user, shown in their preference timezone; there is no separate calendar record. Programs supply schedule templates; individual enrollments generate Calendar Items. Standalone Activities can be placed directly. Multiple programs coexist on one calendar. Friends do not share a writable calendar merely because they join the same program; collaboration overlays participants' independent records through a Program Group.

**Each scheduled Activity executes independently.** A Program Day with three Activities yields three Calendar Items. Each has its own status, Activity Sessions, timer, and results, and can be started, finished, moved, or skipped without touching the others. There is no day-level session, result, or completion.

**Standalone Activities and recurring personal entries are P1.** A user can place any Activity on their calendar once or on a repeating rule with no Program involved.

## 2. Entities

| Model | Fields | Purpose/invariants |
|---|---|---|
| `CalendarItem` | id, ownerId, activityId, activityRevisionId, enrollmentId?, sourceScheduleItemId?, recurrenceId?, idempotencyKey, groupOccurrenceKey?, programDayIndex?, localDate, localTime?, scheduledAtUtc?, status, targetOverrides JSON?, movedFromDate?, isUserAdjusted, reminderSentAt?, createdAt, updatedAt | Dated or date-only occurrence; origin optional; unique `idempotencyKey` |
| `CalendarRecurrence` | id, ownerId, activityId, activityRevisionId, rule JSON, anchorDate, localTime?, timezone, untilDate?, generatedThroughDate?, status ACTIVE/ENDED, timestamps | Personal repeat rule for a standalone Activity. `rule` is `{kind:DAILY}`, `{kind:WEEKDAYS}`, `{kind:WEEKLY,weekdays:[…]}`, or `{kind:EVERY_N_DAYS,n}` |
| `ActivitySession` | id, calendarItemId?, activityRevisionId, userId, status, startedAt?, endedAt?, activeSeconds, lastResumedAt?, isManualCompletion, revision, createdAt | Start/pause/resume/finish attempt; unplanned session allowed |
| `ResultEntry` | id, sessionId, instructionId?, recordedAt, notes?, createdAt | Personal record; zero or more |
| `ResultMetricValue` | id, entryId, metricDefinitionId, intValue?, decimalValue?, boolValue?, textValue?, durationSeconds?, unit? | Exactly one typed value; validate against metric schema |
| `UserAchievement` | id, userId, definitionId, enrollmentId?, sourceCalendarItemId?, isShared, earnedAt, revokedAt? | See §9a |

Calendar Items reference both stable `ActivityId` and pinned `ActivityRevisionId`. For direct unscheduled starts, `ActivitySession.calendarItemId` nullable; when someone starts from Calendar, it is always set. Generated occurrences are stored as rows; a personal move or skip edits that row and sets `isUserAdjusted`, so no separate override table exists. Consolidated persistence: `packages/db/prisma/schema.prisma`.


**Critical DB checks:** exactly one typed ResultMetricValue column non-null; user owns calendar item and session; when CalendarItem.enrollmentId is present it belongs to same user; activity revision matches source placement; `lastResumedAt` is set only while ACTIVE. Use app validation plus DB constraints/triggers/indexes where Prisma alone cannot express. Do not store sensitive amount/notes in group/public aggregate by default.

## 3. Session lifecycle and duration semantics

| Current | Action | Next | Side effects |
|---|---|---|---|
| READY | Start | ACTIVE | startedAt, lastResumedAt = now |
| ACTIVE | Pause | PAUSED | activeSeconds += now − lastResumedAt; clear lastResumedAt |
| PAUSED | Resume | ACTIVE | lastResumedAt = now |
| ACTIVE / PAUSED | Finish | FINISHED | add any running interval, endedAt, final activeSeconds; mark this CalendarItem DONE; emit `SessionFinished` |
| READY | Quick Finish | FINISHED | record manual result and completion; measured duration unknown unless supplied |
| READY / PAUSED | Abandon | ABANDONED | preserve attempt/partial data, do not mark DONE |
| FINISHED | Start again | new ACTIVE Session | new attempt; old result immutable/editable only through audit trail |

State transitions use CAS/`expectedRevision` and server times for accurate duration; client may show an optimistic timer but final server value wins. If offline/interrupted, recover an ACTIVE session conservatively and ask user to confirm resumption/end; do not silently count a day overnight. Multiple attempts for same Calendar Item allowed; chosen completion policy (at least one finished attempt) yields DONE. Undo completion = explicit correction/mark not done with audit event, not deletion of media.

**Result Metric Values:** snapshots typed at entry time, not overwritten by later targets. At Activity level vs Instruction level store `instructionId` to disambiguate. `Last` from most recent valid finished session; `Best` only for metrics with meaningful `betterDirection`; `Completed` number of completed occurrences, not count of clicks/attempts.

## 4. Program template to personal calendar

1. Enrollment pins ProgramVersion and start local date/timezone.
2. Automatic placement: `localDate = startLocalDate + relativeDay` for each ProgramScheduleItem within the 12-week horizon, with no further decisions. Ongoing Programs repeat `cycleDays`. Times only when the template specifies them.
3. Each Calendar Item points to source schedule item, Activity revision and enrollment, has deterministic `idempotencyKey` (`enrollmentId:scheduleItemId:cycleIndex`), and records `programDayIndex` for display and group alignment.
4. Calendar renders combined items sorted by date/time and stable position; standalone items have null source/enrollment. Use a wide monthly workspace and roomy weekly columns; Activity tiles remain readable and emphasize today's date independently of selection. Tiles show permitted group avatars and an available media preview. Users can quick-finish a PLANNED item as an explicit manual completion, or soft-cancel it from the tile; repeating items require an explicit `THIS_ONE` or `THIS_AND_FUTURE` scope.
5. User move changes just that Calendar Item; user duplicate creates another personal occurrence; remove marks CANCELLED (or soft-delete with audit), not source.
6. When a user leaves enrollment, offer `Keep history; remove future scheduled items` vs `Keep future items as standalone` with explicit confirmation. Never erase past completed results.
   - **Calendar visibility vs. retention.** The Calendar is the current schedule, not the history view. Once an enrollment is removed (left, removed from My Programs, the earlier run of a restart, or paused by archiving the Program in the library), none of its items appear on the Calendar, whatever their date or status, including DONE items on past or future dates. `Keep future items as standalone` detaches those items from the enrollment, so they stay visible as standalone items. Standalone items and items of current enrollments (active, paused, completed) stay visible. Runs added with `Run It Again` (`07-PROGRAMS.md`) do not remove earlier runs, so each run's items stay visible; handling of the same Activity scheduled by several runs is a separate Calendar concern.
   - Deleting a Program (owner, `07-PROGRAMS.md` §6) is the one exception: the owner's own Calendar Items for it are deleted with their sessions and results, never detached. Otherwise, hiding is a read rule only. Calendar Items, sessions, results, completion history, media and group records are retained and remain available through My Programs, Activity history and group feeds. Restoring an archived Program shows its paused run again; restarting or re-enrolling shows only the new run.
   - Leaving, pausing, archiving or restarting cancels future PLANNED items unless a session is in progress (ACTIVE or PAUSED); a finished or abandoned session on a PLANNED item (for example after undoing a completion) does not keep it. Only ACTIVE enrollments are extended to the horizon; a paused run resumes from where it stopped.
7. For indefinite recurrence, the worker generates the next horizon daily; because cancelled rows remain, cancellation prevents regeneration.
8. **Personal recurrences** use the same horizon, with `idempotencyKey` `recurrenceId:localDate`. `This one` edits one row. `This and future` ends the recurrence at that date, cancels future non-adjusted PLANNED rows, and for an edit starts a new recurrence. Past results are never touched.
9. **Conflicts:** overlap is allowed. Timed items sharing a local time get `conflict:true` in the API, computed at read time. `POST /calendar-items/:id/move-to-open-slot` moves one to the next open slot that day, or the next day.
10. **Accepting a Program update** replaces future non-adjusted PLANNED items and leaves DONE, adjusted, and past items alone.
11. **Dates before joining.** Each enrollment records `participationStartDate`, the participant's local date when they enrolled. Items generated for earlier dates (a late joiner in a same-start-date group, or a start date chosen in the past) are `NOT_PARTICIPATING`: shown as Not Participating, never Missed, and never reminded. The participant may still log one as a catch-up (it becomes DONE; undo returns it to NOT_PARTICIPATING). Moving one to a date on or after `participationStartDate` makes it PLANNED. Clients cannot set NOT_PARTICIPATING. Completion and adherence (Program progress milestones, Program completion rate, group finished counts) exclude every date before `participationStartDate`, whatever the item's status.

### Date/time corner cases

- Use user's IANA timezone to interpret date/time, not UTC calendar date directly.
- All-day activities have localDate only, no arbitrary midnight UTC instant.
- On DST spring-forward nonexistent local time, shift to next valid time with user-visible note or choose prior valid time by documented policy; fall-back ambiguous times prefer consistent offset and retain local display. Test both.
- Changing profile timezone does not rewrite completed logs; offer explicit choice to shift future event instants or keep local wall-clock schedules.
- For group synchronized activity, stable `groupOccurrenceKey` aligns equivalent relative group day; changes in personal dates do not force group peer dates to move.

## 5. Calendar UI contract

Open app at the **monthly Calendar**, today highlighted. The user can switch between Day, Week, Month, and Year views. Compact navigation, `+ Program`, `+ Activity`, and a consistent app header with the user widget/notifications appear across pages. Small visual tiles display thumbnail/avatar, title, optional source program, time if specified, status, unread indicator, and conflict mark. No navigation sidebar. Tap a tile to open occurrence; edit/move from contextual actions, not drag alone. After `Finish`, return to the same calendar view and date. Shared calendar component has two adapters: Program authoring uses relative days and template placements; Personal Calendar uses absolute dates/user items; interactions visually match, domain persistence differs.

When there are no entries: `Nothing scheduled this week` + `Browse Programs` / `Add Activity`. New user browses seeded programs without having to build one. A participant may add an Activity independent of a Program, once or repeating; authoring its definition opens dedicated builder and returns to selected date.

## 6. Activity occurrence: exact row order

The occurrence page follows `03-UX.md` §6 (authoritative):

1. Header — Title, Program, Date, Status.
2. Today's Results — Reps and only applicable custom metrics, with clear targets and small controls. Do not ask for elapsed session duration a second time.
3. Collaborators — Prominent avatars, permitted completion, completion reactions. **Omit when solo.**
4. Session Controls — Clear Start/Pause/Resume/Finish progression and `Finish now`; elapsed time is calculated from session timestamps and paused time is excluded. `Upload media` beside them adds private session media without starting the session.
5. My Metrics — Last, Best, Completed (choose relevant maximum three).
6. Related Media — One section: private media first, then permitted group-shared and public community media with attribution; add (library or upload), view, manage attachments and history from here.
7. Community Stats — Privacy-safe participants, completions, popularity; omit unhelpful.

These seven rows are locked. No tabs or separate sections between private/group/public media. Instructions blend into content as compact text and media; no forced “read instructions”. There is no chat or live video control in P1.

## 7. DTOs

```ts
interface CalendarItemDto { id:string; localDate:string; localTime:string|null; status:string;
  title:string; activityId:string; activityRevisionId:string; programTitle:string|null;
  programDayIndex:number|null; recurrenceId:string|null; conflict:boolean; locked:boolean;
  thumbnailUrl:string|null; participantAvatars:string[]; unreadCount:number; }
interface CalendarQueryDto { startDate:string; endDate:string; timezone:string; }
interface AddCalendarItemDto { activityId:string; revisionId?:string; localDate:string;
  localTime?:string|null; recurrence?:RecurrenceRuleDto|null; untilDate?:string|null;
  targetOverrides?:Record<string,unknown>; }
interface RecurrenceRuleDto { kind:'DAILY'|'WEEKDAYS'|'WEEKLY'|'EVERY_N_DAYS'; weekdays?:number[]; n?:number; }
interface CalendarRecurrenceDto { id:string; activityId:string; title:string; rule:RecurrenceRuleDto;
  anchorDate:string; localTime:string|null; untilDate:string|null; status:'ACTIVE'|'ENDED'; }
interface UpdateRecurrenceDto { rule?:RecurrenceRuleDto; localTime?:string|null; untilDate?:string|null;
  effectiveFromDate:string; }
interface MoveCalendarItemDto { localDate:string; localTime?:string|null; expectedUpdatedAt:string; }
interface AchievementDto { id:string; key:string; label:string; description:string; icon:string;
  programTitle:string|null; earnedAt:string; isShared:boolean; }
interface ActivityOccurrenceDto { item:CalendarItemDto; session:ActivitySessionDto|null;
  resultInputs:MetricInputDto[]; personalStats:PersonalStatDto[];
  myMedia:MediaThumbDto[]; sharedMedia:MediaThumbDto[];
  communityMedia:PublicMediaThumbDto[]; collaborators:CollaboratorSummaryDto|null;
  communityStats:CommunityStatsDto|null; }
interface ActivitySessionDto { id:string; status:'READY'|'ACTIVE'|'PAUSED'|'FINISHED'|'ABANDONED';
  startedAt:string|null; activeSeconds:number|null; revision:number; }
interface SessionActionDto { action:'START'|'PAUSE'|'RESUME'|'FINISH'|'ABANDON'; expectedRevision:number; }
interface SaveResultEntryDto { instructionId?:string|null; values:{metricDefinitionId:string;
  value:number|string|boolean; unit?:string}[]; notes?:string|null; }
interface PersonalStatDto { key:string; label:string; value:string; computedAt:string; }
```

## 8. DAOs / services / API

```ts
interface CalendarDao {
  listItems(userId:string,range:DateRange,db:Db):Promise<CalendarItemRow[]>;
  addItem(data:NewCalendarItem,db:Db):Promise<CalendarItemRow>;
  moveItem(userId:string,itemId:string,next:CalendarPosition,db:Db):Promise<CalendarItemRow>;
  cancelItem(userId:string,itemId:string,db:Db):Promise<void>;
  materializeEnrollment(enrollment:EnrollmentRow,placements:TemplatePlacement[],db:Db):Promise<number>;
}
interface SessionDao {
  findCurrent(userId:string,calendarItemId:string,db:Db):Promise<SessionRow|null>;
  create(userId:string,itemId:string|null,revisionId:string,db:Db):Promise<SessionRow>;
  transition(id:string,action:SessionAction,expectedRevision:number,db:Db):Promise<SessionRow>;
  appendResult(id:string,values:TypedResult[],db:Db):Promise<ResultEntryRow>;
  summarizeUserActivity(userId:string,activityId:string,db:Db):Promise<PersonalStats>;
}
```

`CalendarService`: placement, recurrence, materialization, moves, conflicts. `SessionService`: transition/timing/finish; `ResultService`: validation/privacy/projections; `AchievementService`: evaluates completions. `ActivityOccurrenceQueryService`: combines domain view data in correct row order; don't make Calendar DAO pull all media/social items.

Routes: `GET /calendar/items?start&end`, `POST /calendar/items`, `PATCH|DELETE /calendar-items/:id` (PATCH with status PLANNED restores a cancelled item), `POST /calendar-items/:id/move-to-open-slot`, `GET /calendar-items/:id/occurrence`, `PATCH|DELETE /calendar/recurrences/:id`, `GET /calendar/recurrences`, `POST /sessions`, `GET /sessions/:id` (with its result entries), `POST /sessions/:id/actions`, `POST /sessions/:id/results`, `POST /calendar-items/:id/undo-completion`, `GET /activities/:id/my-stats`, `GET /achievements/me`, `PATCH /achievements/:id`.

## 9. Notifications and privacy

Calendar tile unread count references only unread notifications about that group occurrence the user can access. Session finished emits event with minimal metadata; `CompletionSharingService` decides whether completion status is shared and whether a notification is sent. Exact result values, private media and notes are **never** included in notifications or emails. User can mute a group.

**Reminders:** see `12-SOCIAL.md` §6. A lapsed-subscription item stays on the Calendar with `locked:true`.

## 9a. Achievements

Simple milestones **derived from actual completions**, evaluated in the same transaction that finishes a session (so the Finish return can show them) and re-evaluated when a completion is undone; never self-reported or client-asserted. A completion means a Calendar Item reached DONE or an unscheduled session FINISHED; an attempt, click, or abandoned session does not count.

Seeded `AchievementDefinition` rows (`key`, `label`, `description`, `icon`, `ruleKind`, `threshold?`): first completed Activity; 10, 50, and 100 completed Activities; first full Program week (every placement in a Program's first seven days DONE); halfway through a Program; Program completed (every non-cancelled item DONE). No streaks and no comparison between people.

Unique `(userId, definitionId, enrollmentId)`, with evaluation idempotent. `Undo` of a completion re-evaluates and sets `revokedAt` when the milestone no longer holds. Achievements are private until `isShared` is set; a shared one may appear on the combined profile and to the user's groups, without metric values. Earning one creates an in-app notification; never an email.

## 10. Tests

- Two adopted programs + one standalone Activity in same Calendar, no duplicates after retries.
- Relative 30-day challenge materialization and repeat; personal move does not change friend's.
- Three Activities on one Program Day: finishing one leaves the others PLANNED with no shared timer or results.
- Standalone recurrence: weekly rule generates within the horizon; `This one` and `This and future` behave as specified; no duplicates on worker retry; past results stay.
- Overlap allowed and flagged; move-to-open-slot; first-use empty week.
- Achievements only from real completions; replay does not duplicate; undo revokes.
- One Activity in three schedule placements renders three Calendar Items sharing same Activity ID.
- All-day, DST, timezone changes, ongoing recurrence bounded, cancellation idempotency.
- Session double Start/Pause/Finish race, paused duration excluded, restart creates new attempt.
- Metric Last/Best uses typed schema and legitimate direction, not score comparison across people.
- Calendar page default opens same selected date after record/upload/editor return.
- Data isolation: collaborator can see only permitted completion/posted media, not raw personal log.
