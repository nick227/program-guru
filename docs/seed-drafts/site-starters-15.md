# Program.Guru — 15 Site-Starter Programs (Approved Plan v3)

**Status:** Approved & implementing into `packages/db/prisma/seed/`, `packages/db/prisma/platform-assets/`, `packages/shared/`, `apps/server/`, and `apps/web/`.  
**Catalog direction:** Replace and safely archive (`retire.ts`) the 5 previous course-like starter Programs with **15 focused, action-oriented site starters** (3 per core Category), preserving exact starter names (`"Build your Core"` typo fix applied), reusing compatible canonical Activities (`push-ups`, `plank`, `leg-raises`, `glute-bridge`, `cool-down`), avoiding filler Activities, and keeping existing user enrollments/history intact.

## Scheduling Verification Summary

- **Ongoing daily habits (`durationDays: null`, `cycleDays: 7`, `frequency: { kind: 'DAILY' }`):** Supported across schema, `schedule.ts`, `materializeEnrollment`, worker horizon extension (`84` days), Discover `duration=ONGOING`, and preview projection (`writer.ts` explicitly sets `cycleDays: 7` on ongoing non-monthly versions).
- **Monthly recurrence (`durationDays: null`, `cycleDays: null`, `frequency: { kind: 'MONTHLY' }`):** Added first-class `MONTHLY` support across OpenAPI/SDK, `content-contract.ts`, `time.ts` (`addMonths` with end-of-month clamping), `schedule.ts` (`Monthly` label), `materialize.ts` / `enrollment.service.ts` / `recurrence.ts`, `ScheduleControls.tsx`, and `scheduleProjection.ts` rather than substituting weekly cycles.

---

## Summary Table (15 Programs Across 5 Categories)

| # | Category | Exact Program Title | Canonical Slug (`starter-*` seed key) | Program Type | Focus | Level | Typical Session | Presentation | Schedule |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Fitness | **Ten pushups and ten situps** | `ten-pushups-and-ten-situps` | `workout` | `strength` | `BEGINNER` | `5` min | `GROUPED` | 3× weekly (`21` days, `07:15`) |
| 2 | Fitness | **Jog one mile** | `jog-one-mile` | `walking-plan` | `cardio` | `ALL_LEVELS` | `15` min | `SEPARATE` | 3× weekly (`28` days, `07:00`) |
| 3 | Fitness | **Build your Core** | `build-your-core` | `workout` | `strength` | `BEGINNER` | `20` min | `GROUPED` | 3× weekly (`28` days, `07:30`) |
| 4 | Wellness | **Drink one glass of water** | `drink-one-glass-of-water` | `wellness-routine` | `daily-reflection` | `ALL_LEVELS` | `2` min | `SEPARATE` | Ongoing daily (`durationDays: null`, `08:00`) |
| 5 | Wellness | **60-second meditation** | `60-second-meditation` | `meditation-routine` | `mindfulness` | `ALL_LEVELS` | `2` min | `SEPARATE` | Ongoing daily (`durationDays: null`, `12:30`) |
| 6 | Wellness | **Sleep relaxation technique** | `sleep-relaxation-technique` | `sleep-routine` | `rest` | `ALL_LEVELS` | `10` min | `SEPARATE` | Ongoing daily (`durationDays: null`, `21:30`) |
| 7 | Finance | **Balance monthly budget** | `balance-monthly-budget` | `budget-routine` | `spending-review` | `ALL_LEVELS` | `20` min | `SEPARATE` | Monthly ongoing (`durationDays: null`, `19:00`) |
| 8 | Finance | **Work on business plan** | `work-on-business-plan` | `financial-learning` | `fundamentals` | `INTERMEDIATE` | `30` min | `SEPARATE` | 2× weekly (`28` days, `18:30`) |
| 9 | Finance | **Make sales calls** | `make-sales-calls` | `financial-learning` | `fundamentals` | `INTERMEDIATE` | `25` min | `SEPARATE` | 3× weekly (`21` days, `10:00`) |
| 10 | Education | **Read a non-fiction book** | `read-a-non-fiction-book` | `reading-plan` | `professional-skills` | `ALL_LEVELS` | `20` min | `SEPARATE` | Daily (`28` days, `20:00`) |
| 11 | Education | **Read a fiction book** | `read-a-fiction-book` | `reading-plan` | `languages` | `ALL_LEVELS` | `20` min | `SEPARATE` | Daily (`28` days, `20:30`) |
| 12 | Education | **Attend learning event** | `attend-learning-event` | `study-program` | `professional-skills` | `ALL_LEVELS` | `45` min | `SEPARATE` | Monthly ongoing (`durationDays: null`, `18:00`) |
| 13 | Relationships | **Do something nice** | `do-something-nice` | `connection-plan` | `communication` | `ALL_LEVELS` | `10` min | `SEPARATE` | 3× weekly (`21` days, `12:00`) |
| 14 | Relationships | **Send a friendly text** | `send-a-friendly-text` | `connection-plan` | `friends` | `ALL_LEVELS` | `5` min | `SEPARATE` | 3× weekly (`21` days, `17:30`) |
| 15 | Relationships | **Have dinner with a friend** | `have-dinner-with-a-friend` | `shared-activity-plan` | `quality-time` | `ALL_LEVELS` | `60` min | `SEPARATE` | Monthly ongoing (`durationDays: null`, `19:00`) |
