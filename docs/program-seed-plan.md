# Program Seed Inventory & Plan — v2

**Status:** Baseline v2 (5 reference Programs, 25 Activities, 6 Categories, 10 Tags)  
**Source of truth:** `packages/db/prisma/seed/` · **Contract:** `packages/shared/src/content-contract.ts` · **Bootstrap:** `docs/database-bootstrap.md`

This document defines our current catalog inventory, the quality standard every published Program must meet, the three-layer content model for future AI-assisted authoring, and our editorial workflow. **We treat the existing 5 core Programs as our reference library and strengthen them in place before expanding.**

---

## 1. Core Baseline (5 Flagship Programs)

| Category | Flagship Program | Canonical Slug | Activities in Program |
|---|---|---|---|
| **Fitness** | Beginner Core & Strength | `/programs/beginner-core-strength` | 6 (`warm-up`, `squats`, `push-ups`, `plank`, `glute-bridge`, `cool-down`) |
| **Wellness** | Daily Mindfulness & Reflection | `/programs/daily-mindfulness-reflection` | 3 (`morning-routine`, `guided-meditation`, `gratitude-journal`) |
| **Finance** | Weekly Savings & Budget Routine | `/programs/weekly-savings-budget` | 4 (`savings-contribution`, `weekly-budget-review`, `categorize-expenses`, `review-subscriptions`) |
| **Education** | Daily Language & Study Habit | `/programs/daily-language-study` | 3 (`vocabulary-review`, `read-for-20-minutes`, `practice-speaking`) |
| **Relationships** | Staying in Touch | `/programs/staying-in-touch` | 4 (`send-a-check-in-message`, `call-a-friend`, `plan-quality-time`, `write-a-thank-you-note`) |

We retain the **5 standalone Activities** (`leg-raises`, `breathing-exercise`, `evening-wind-down`, `listening-practice`, `write-a-summary` as our `textOnly` outlier) and the complete taxonomy (**6 categories**, **20 focuses**, **17 program types**, **10 tags**). We will **not** add more Programs merely to populate filter combinations.

---

## 2. Program Quality Standard

Every published platform Program must satisfy all eight criteria:

1. **Clear outcome:** What participants are tangibly working toward by the end of the run.
2. **Specific audience:** Who the Program is designed for (experience level, constraints, realistic weekly commitment).
3. **Useful schedule:** Activities distributed logically across the duration with sensible pacing, sequencing, and recovery.
4. **Substantial instructions:** Concrete, coach-grade execution guidance (setup, cues, variations/regressions), never generic reminders.
5. **Measurable participation:** Appropriate metrics (`repetitions`, `sets`, `duration`, `contribution_amount`, `pages`, `completion`, `notes`) and interactive tools (`TIMER`, `COUNTER`, `CHECKLIST`, `NOTES`, `CALCULATOR`, `MEDIA_CAPTURE`).
6. **Accurate classification:** Correct Category, Program Type, Focus, `level`, `sessionMinutes`, and cross-category `tags`.
7. **Strong media:** A distinct rights-cleared (CC0-1.0) landscape cover photograph and useful Activity visuals (except intentional `textOnly` outliers).
8. **Repeatability:** Clear progression cues or notes so the Program remains valuable on Run 2+ (`Run It Again`) without losing structure.

---

## 3. Three-Layer Content Model (Built for Reuse & AI Generation)

| Layer | Contents | Purpose | Primary Contract |
|---|---|---|---|
| **Program** | Identity, stable slug, outcome, audience, classification (`category`, `programType`, `focus`, `level`, `sessionMinutes`, `tags`), `sessionPresentation`, cover media | **Discovery & storefront preview** | `ProgramContent` (discovery metadata) |
| **Activity** | Reusable definition: title, summary, `durationMinutes`, `targetTime`, default `frequency`, instructions (1–3 concise steps), metrics, tools, media | **Execution & logging** | `ActivityContent` |
| **Schedule** | Activity references (`activitySlugs`), `durationDays`, `frequency`, `generationMode`, `placements` (day, position, localTime, `targetOverrides`) | **Calendar projection & weekly progression** | `ProgramContent.placements` |

**Locked Schedule Presentation Decision (Option A — Calendar Session Grouping):**
* **No composite Activities and no new `ProgramSession` entity:** Programs always reference canonical Activities and keep independent `ProgramScheduleItem` / `CalendarItem` records so personal `Last`/`Best`/`Completed` history, metrics, media hubs, and Calendar editing stay intact.
* **Two Calendar presentations (`sessionPresentation` on `Program` / `ProgramVersion`):**
  * `'GROUPED'` *(used by multi-exercise workouts like Beginner Core & Strength)*: Underlying `ProgramScheduleItem` / `CalendarItem` rows stay independent in the database, while the Calendar groups non-cancelled items sharing `(enrollmentId, localDate)` into **one expandable workout tile** ordered by `position` / `localTime` (e.g. *Beginner Core & Strength · Day 1 · 40 min · 0/6 done*). Expanding the tile reveals all ordered Activities for independent start/pause/finish, metric logging, quick-finish, time-slot move, or skip/remove. Moving a single item to a different date leaves it separate on that date without breaking the rest of the session.
  * `'SEPARATE'` *(default; used by spread-out daily routines like Daily Mindfulness at 08:00 / 12:30 / 20:30)*: Each placement renders as its own individual Calendar tile at its scheduled time.
* **Gradual, optional weekly progression via `targetOverrides`:** `ProgramScheduleItem.targetOverrides` supplies optional weekly/day-level suggested targets without forking the Activity. Actual recorded results (`ResultMetricValue`) remain strictly separate from targets, and `previous` finished results inform Run 2+ without modifying the Program template.

**Reuse rule:** One canonical Activity can belong to many Programs (`warm-up`, `cool-down`, `breathing-exercise`, etc.). Future AI-assisted generation should search and reuse existing canonical Activities wherever appropriate rather than creating near-duplicate copies, and must output into the exact same `ProgramContent` / `ActivityContent` contract used by manual authoring and `/admin/content/import`.

---

## 4. Publishing Workflow

```text
Draft (readable text)  →  Validate  →  Review  →  Import / Seed  →  Publish
```

1. **Draft (readable text):** Write the Program and its Activities in human-readable Markdown (`docs/seed-drafts/<slug>.md`) covering all three layers and the 8 quality criteria.
2. **Validate:** Convert to `ProgramContent` / `ActivityContent` and run structural + taxonomy + media validation (`validateContentPack()`, `/admin/content/import` with `dryRun: true`, `pnpm db:bootstrap:check`).
3. **Review:** Editorial check of safety cues, clarity, schedule math, and media rights/licensing.
4. **Import / Seed:** Write deterministically into the platform catalog (preserving stable UUIDs, canonical slugs, and existing user enrollments/history).
5. **Publish:** Publish immutable `ProgramVersion` / `ActivityRevision` snapshots through the standard publishing path.

---

## 5. In-Place Reference Upgrade Plan (Current Phase)

1. **Step 1 — Reference Program in text first:** Build out `Beginner Core & Strength` in [beginner-core-strength.md](seed-drafts/beginner-core-strength.md) with complete outcome/audience framing, full Activity instructions (including regressions/progressions for repeatability), metrics/tools, 28-day schedule, tags, and media requirements.
2. **Step 2 — Approve & implement Step 1:** Once the text draft is approved, apply it in place to `packages/db/prisma/seed/content/fitness.ts` (preserving `deterministicUuid('program:starter-beginner-core-strength')`, canonical slug `beginner-core-strength`, and existing Activity IDs) and verify with `pnpm db:bootstrap`.
3. **Step 3 — Upgrade the remaining 4 baseline Programs:** Use `Beginner Core & Strength` as the reference template to draft, review, and upgrade `Daily Mindfulness & Reflection`, `Weekly Savings & Budget Routine`, `Daily Language & Study Habit`, and `Staying in Touch` in place.
4. **Step 4 — Future Expansion (Deferred):** Only after all 5 core Programs meet the quality bar will we develop additional Programs (candidates on file: *Progressive Walk & Stamina*, *Evening Sleep & Rest Reset*, *Monthly Spending & Bill Audit*, *Deep Work & Exam Mastery*, *Family Shared Rituals*, plus new categories via `defineCategory()`). Expansion is driven strictly by content quality, never by empty filter slots.

---

## 6. Reference Inventory Snapshot

### Taxonomy & Definitions (`packages/db/prisma/seed/`)
* **Categories (6):** `fitness`, `wellness`, `finance`, `relationships`, `education`, `custom`
* **Focuses (20):** `strength`, `cardio`, `flexibility`, `endurance`, `general-fitness` (`fitness`); `mindfulness`, `relaxation`, `rest`, `daily-reflection` (`wellness`); `emergency-fund`, `spending-review`, `fundamentals` (`finance`); `friends`, `family`, `communication`, `quality-time` (`relationships`); `languages`, `music`, `exam-prep`, `professional-skills` (`education`)
* **Program Types (17):** 5 featured (`workout`, `wellness-routine`, `savings-plan`, `study-program`, `relationship-plan`) + 12 additional (`mobility-routine`, `walking-plan`, `meditation-routine`, `sleep-routine`, `reflection-plan`, `budget-routine`, `financial-learning`, `connection-plan`, `shared-activity-plan`, `practice-routine`, `reading-plan`, `custom-program`)
* **Tags (10):** `no-equipment`, `at-home`, `outdoors`, `quick-win`, `guided`, `low-impact`, `daily-habit`, `pen-and-paper`, `audio-optional`, `partner-or-group`
* **Metrics (11):** `completion`, `repetitions`, `sets`, `duration`, `distance`, `weight`, `contribution_amount`, `lesson_count`, `pages`, `rating`, `notes`
* **Tools (6):** `TIMER`, `COUNTER`, `CHECKLIST`, `NOTES`, `CALCULATOR`, `MEDIA_CAPTURE`

### Standalone Activities (5 retained)
`leg-raises` (`fitness`), `breathing-exercise` (`wellness`), `evening-wind-down` (`wellness`), `listening-practice` (`education`), `write-a-summary` (`education`, `textOnly: true`).

### Retired Legacy Seeds (archived via `retire.ts`, never deleted)
* **Retired starter Programs (18):** `starter-hiit-aerobic-conditioning`, `starter-full-body-calisthenics`, `starter-joint-mobility-flow`, `starter-functional-daily-fitness`, `starter-deep-sleep-evening-reset`, `starter-stress-relief-breathwork`, `starter-mindful-walking-nature`, `starter-weekly-intentional-habits`, `starter-emergency-fund-kickstart`, `starter-spending-audit-cleanup`, `starter-personal-finance-fundamentals`, `starter-exam-prep-retention`, `starter-professional-skills-deep-work`, `starter-daily-musical-practice`, `starter-active-reading-habit`, `starter-family-connection-rituals`, `starter-intentional-quality-time`, `starter-gratitude-communication`.
* **Retired Activities (56):** Listed in `RETIRED_ACTIVITY_SLUGS` in `packages/db/prisma/seed/retire.ts`.
