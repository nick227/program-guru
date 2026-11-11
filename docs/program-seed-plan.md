# Program Seed Inventory & Plan — v3

**Status:** Baseline v3 (15 site-starter Programs, 19 canonical Activities, 6 Categories, 10 Tags)  
**Source of truth:** `packages/db/prisma/seed/` · **Contract:** `packages/shared/src/content-contract.ts` · **Bootstrap:** `docs/database-bootstrap.md`

This document defines the active **15 simple, action-oriented site-starter Programs** (3 per core Category), scheduling rules (including ongoing daily and true calendar `MONTHLY` recurrence), quality bar, and the 3-layer content model for future AI-assisted authoring. For full per-Program details, see [site-starters-15.md](seed-drafts/site-starters-15.md).

---

## 1. Core Site Starters (15 Programs Across 5 Categories)

| Category | Flagship Program | Canonical Slug | Schedule | Presentation | Activities in Program |
|---|---|---|---|---|---|
| **Fitness** | Ten pushups and ten situps | `/programs/ten-pushups-and-ten-situps` | 3× weekly (`21` days) | `GROUPED` | 2 (`push-ups`, `sit-ups`) |
| **Fitness** | Jog one mile | `/programs/jog-one-mile` | 3× weekly (`28` days) | `SEPARATE` | 1 (`jog-one-mile`) |
| **Fitness** | Build your Core | `/programs/build-your-core` | 3× weekly (`28` days) | `GROUPED` | 4 (`plank`, `leg-raises`, `glute-bridge`, `cool-down`) |
| **Wellness** | Drink one glass of water | `/programs/drink-one-glass-of-water` | Ongoing daily | `SEPARATE` | 1 (`drink-glass-of-water`) |
| **Wellness** | 60-second meditation | `/programs/60-second-meditation` | Ongoing daily | `SEPARATE` | 1 (`sixty-second-meditation`) |
| **Wellness** | Sleep relaxation technique | `/programs/sleep-relaxation-technique` | Ongoing daily | `SEPARATE` | 1 (`sleep-relaxation-technique`) |
| **Finance** | Balance monthly budget | `/programs/balance-monthly-budget` | Monthly ongoing | `SEPARATE` | 1 (`balance-monthly-budget`) |
| **Finance** | Work on business plan | `/programs/work-on-business-plan` | 2× weekly (`28` days) | `SEPARATE` | 1 (`work-on-business-plan`) |
| **Finance** | Make sales calls | `/programs/make-sales-calls` | 3× weekly (`21` days) | `SEPARATE` | 1 (`make-sales-calls`) |
| **Education** | Read a non-fiction book | `/programs/read-a-non-fiction-book` | Daily (`28` days) | `SEPARATE` | 1 (`read-non-fiction-book`) |
| **Education** | Read a fiction book | `/programs/read-a-fiction-book` | Daily (`28` days) | `SEPARATE` | 1 (`read-fiction-book`) |
| **Education** | Attend learning event | `/programs/attend-learning-event` | Monthly ongoing | `SEPARATE` | 1 (`attend-learning-event`) |
| **Relationships** | Do something nice | `/programs/do-something-nice` | 3× weekly (`21` days) | `SEPARATE` | 1 (`do-something-nice`) |
| **Relationships** | Send a friendly text | `/programs/send-a-friendly-text` | 3× weekly (`21` days) | `SEPARATE` | 1 (`send-friendly-text`) |
| **Relationships** | Have dinner with a friend | `/programs/have-dinner-with-a-friend` | Monthly ongoing | `SEPARATE` | 1 (`have-dinner-with-a-friend`) |

Every Program uses only the Activities needed for its schedule (**19 canonical Activities**, zero filler). Taxonomy remains complete (**6 categories**, **20 focuses**, **17 program types**, **10 tags**).

---

## 2. Program Quality Standard

Every published platform Program must satisfy all eight criteria:

1. **Clear outcome:** Plain statement of what showing up delivers.
2. **Specific audience:** Who the Program fits without assuming advanced gear or background.
3. **Useful schedule:** Realistic cadence matching the habit (3× weekly, 2× weekly, finite daily, ongoing daily via `cycleDays: 7`, or ongoing `MONTHLY` via calendar-month advancement).
4. **Concrete instructions:** Concise 1–3 step instructions (`plank` keeps 1 step per `08-ACTIVITIES.md` §9).
5. **Measurable participation:** Typed metrics (`repetitions`, `sets`, `duration`, `distance`, `pages`, `contribution_amount`, `rating`, `completion`, `notes`) and matching tools.
6. **Accurate classification:** Correct Category, Program Type, Focus, `level`, `sessionMinutes`, `sessionPresentation`, and cross-category `tags`.
7. **Strong media:** Curated CC0-1.0 Wikimedia Commons landscape cover (`1600×900`) and generated CC0-1.0 Activity illustration.
8. **Repeatability:** Targets stay separate from logged `ResultMetricValue` entries so subsequent runs keep prior history without modifying the Program template.

---

## 3. Three-Layer Content Model & Calendar Presentation

* **Program:** Identity, canonical slug, description, classification, `sessionPresentation` (`SEPARATE` | `GROUPED`), cover media.
* **Activity:** Canonical reusable execution unit (1–3 instructions, baseline metrics, tools, media).
* **Schedule:** Finite durations (`durationDays: N`), ongoing weekly cycles (`durationDays: null, cycleDays: 7`), and ongoing monthly recurrence (`durationDays: null, frequency: { kind: 'MONTHLY' }, cycleDays: null` rolled forward with calendar-month `addMonths` and end-of-month clamping). Multi-exercise sessions (*Ten pushups and ten situps*, *Build your Core*) use `GROUPED` presentation (`WorkoutGroupTile`) while single-habit or spaced routines stay `SEPARATE`.

---

## 4. Publishing Workflow & Retired Legacy Slugs

```text
Draft (readable text)  →  Validate  →  Review  →  Import / Seed  →  Publish
```

All retired legacy starter Programs (`18` earlier starters plus the `5` v2 starters: `starter-beginner-core-strength`, `starter-daily-mindfulness-reflection`, `starter-weekly-savings-budget`, `starter-daily-language-study`, `starter-staying-in-touch`) and unused Activities (`RETIRED_ACTIVITY_SLUGS` in `retire.ts`) are archived (`status: 'ARCHIVED'`) rather than deleted, preserving any existing user enrollments, Calendar items, sessions, and logged results.
