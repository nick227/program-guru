# Reference Program Draft: Beginner Core & Strength

**Workflow stage:** `Draft (readable text + contract preview)` — review and approve before converting into code (`packages/db/prisma/seed/content/fitness.ts`, `targetOverrides` support, and Calendar session grouping).  
**Update strategy:** In-place upgrade preserving `deterministicUuid('program:starter-beginner-core-strength')`, canonical slug `beginner-core-strength`, and existing Activity IDs/slugs.

---

## Locked Design Choices for This Reference Program

1. **Schedule presentation (Option A — `GROUPED` expandable workout tile):** No composite Activities and no `ProgramSession` table. All **6 canonical Activities** and their `ProgramScheduleItem` / `CalendarItem` rows remain independent underneath. On the Calendar, non-cancelled items sharing `(enrollmentId, localDate)` render as **1 expandable workout tile** (*Beginner Core & Strength · Day 1 · 40 min · 0/6 done*, **12 workout tiles over 4 weeks** instead of 72 competing tiles). Expanding the tile exposes the 6 ordered Activities for independent execution, metric logging, quick-finish, move, or cancel; moving one item to another date ungroups only that item.
2. **Gradual, optional 4-week progression (`targetOverrides`):** Same 6 movements across all 4 weeks, using `ProgramScheduleItem.targetOverrides` to offer gentle, optional weekly target progression across **Weeks 1 → 4** without duplicating or mutating the canonical Activity definitions.
3. **Timing reconciled to 40 minutes exact:** `5 + 9 + 9 + 5 + 7 + 5 = 40` minutes (`07:30–08:10`).
4. **Instructions kept concise (1–3 steps):** Scannable coaching cues with regression/progression notes inline; `plank` stays the 1-step outlier (`08-ACTIVITIES.md` §9).
5. **Targets vs. actuals & repeat runs:** Targets remain suggestions (`targetOverrides` / `defaults.target`) strictly separate from recorded `ResultMetricValue` entries; on Run 2+ (`Run It Again`), `occurrence()` surfaces the user’s `previous` finished result so they can step down an incline, slow tempo, or add reps without modifying the Program definition.

---

## Layer 1 — Program (Discovery & Storefront)

* **Title:** Beginner Core & Strength
* **Slug:** `beginner-core-strength` *(seed key `starter-beginner-core-strength`)*
* **Classification:**
  * **Category:** `fitness` (Fitness)
  * **Program Type:** `workout` (Workout)
  * **Focus:** `strength` (Strength)
  * **Level:** `BEGINNER`
  * **Typical Session:** `40` minutes
  * **Session Presentation:** `GROUPED` *(1 Calendar workout tile per Program Day)*
  * **Tags:** `no-equipment`, `at-home`, `guided`
* **Visibility & Access:** `PUBLIC` / `OPEN`

### Outcome & Audience Copy (`Program.description`)

> Build foundational lower-body strength, upper-body pressing control, and deep core stability in three structured 40-minute bodyweight workouts a week—progressing steadily from Week 1 to Week 4 with no equipment required.
>
> **Who it’s for:** Beginners starting or restarting a strength habit, and anyone wanting a joint-friendly at-home foundation.
>
> **What you’ll build over 4 weeks:** Week 1 establishes clean movement patterns (`3×10` squats, `3×8` push-ups, `30s` plank); Weeks 2–4 progressively build volume and core endurance up to `3×16` squats, `3×14` push-ups, and a `60s` plank hold inside the same 40-minute session window.
>
> **How repeat runs work:** Your past logged reps, sets, and notes stay attached to each exercise. When you run the Program again, use your previous logged results to step down to a lower push-up incline, slow your lowering tempo, or complete every target cleanly.

### Cover Media Requirement
* **Type:** Landscape 16:9 photograph (`1600×900` JPG + `640×360` WebP thumb)
* **Rights:** CC0-1.0 (`File:Kurzhanteln 2 x 15 kg 1v2.jpg` via Wikimedia Commons, verified in `program-cover-sources.json`)
* **Alt text:** Two loaded dumbbells on a concrete floor

---

## Layer 2 — Activities (Canonical Execution & Logging)

Every Activity preserves its canonical slug (`warm-up`, `squats`, `push-ups`, `plank`, `glute-bridge`, `cool-down`), keeps **1–3 concise instructions**, and separates baseline targets from actual recorded results.

### 1. `warm-up` — Warm-up (`5` min · `07:30`)
* **Category / Focuses:** `fitness` / `general-fitness`, `flexibility`
* **Summary:** Five-minute dynamic joint prep and pulse-raiser for hips, shoulders, and ankles.
* **Instructions (3 steps):**
  1. **Mobilize joints:** Do 10 slow shoulder circles each way, 10 hip circles each way, and 10 ankle rolls per foot.
  2. **Raise your pulse:** March briskly or step side to side with arm swings for 2 minutes until comfortably warm.
  3. **Rehearse the patterns:** Complete 5 easy half-squats and 5 wall push-ups to prime your range before Set 1.
* **Baseline Metrics & Tools:** `duration` (`300` s, required), `completion` (`true`) · `TIMER` (`{ seconds: 300 }`)
* **Media:** `illustrations/warm-up.jpg` (CC0-1.0)

### 2. `squats` — Squats (`9` min · `07:35`)
* **Category / Focuses:** `fitness` / `strength`, `general-fitness`
* **Summary:** Lower-body bodyweight strength movement for quads, glutes, and trunk stability.
* **Instructions (3 steps):**
  1. **Set stance:** Stand shoulder-width apart with toes turned slightly out and weight balanced across heel, big toe, and little toe.
  2. **Lower with control:** Sit hips back and down for 2 seconds, keeping heels grounded and knees tracking over toes (use a chair touch behind you if depth feels tight).
  3. **Drive up & rest:** Press evenly through both feet to stand tall without locking knees; rest 60 seconds between sets. On repeat runs, add a 1-second pause at the bottom.
* **Baseline Metrics & Tools:** `repetitions` (baseline `12`, required), `sets` (baseline `3`), `notes` (optional variation/tempo) · `COUNTER` (`{ step: 1 }`), `NOTES`
* **Media:** `illustrations/squats.jpg` (CC0-1.0); `hasVideo: true`

### 3. `push-ups` — Push-ups (`9` min · `07:44`)
* **Category / Focuses:** `fitness` / `strength`, `endurance`
* **Summary:** Scalable upper-body and core pressing exercise from wall, bench, or floor.
* **Instructions (3 steps):**
  1. **Pick your surface:** Place hands slightly wider than shoulders on a wall, sturdy counter/bench, or floor so every rep stays crisp without sagging hips.
  2. **Lower cleanly:** Brace ribs and glutes, then lower your chest toward your hands with elbows angled ~45° back from your torso.
  3. **Press & rest:** Push away smoothly while keeping head, torso, and hips aligned; rest 60–75 seconds between sets. Lower your incline height on future runs.
* **Baseline Metrics & Tools:** `repetitions` (baseline `10`, required), `sets` (baseline `3`), `notes` (optional incline surface) · `COUNTER` (`{ step: 1 }`), `NOTES`
* **Media:** `illustrations/push-ups.jpg` (CC0-1.0); `hasVideo: true`

### 4. `plank` — Plank (`5` min · `07:53`)
* **Category / Focuses:** `fitness` / `strength`, `endurance`
* **Summary:** Isometric full-body hold for deep trunk endurance and shoulder stability.
* **Instructions (1 step — intentional `08 §9` outlier):**
  1. **Brace and hold:** Support yourself on forearms and toes (or forearms and knees to scale) with elbows under shoulders and ribs stacked over hips; press the floor lightly away and breathe steadily through your nose for the target hold.
* **Baseline Metrics & Tools:** `duration` (baseline `45` s, required), `notes` (optional toes vs. knees) · `TIMER` (`{ seconds: 45 }`), `NOTES`
* **Media:** `illustrations/plank.jpg` (CC0-1.0); `hasVideo: true`

### 5. `glute-bridge` — Glute Bridge (`7` min · `07:58`)
* **Category / Focuses:** `fitness` / `strength`, `general-fitness`
* **Summary:** Floor hip-extension movement strengthening glutes, hamstrings, and lower-back support.
* **Instructions (3 steps):**
  1. **Set feet:** Lie on your back with knees bent, feet hip-width apart, and shins vertical at the top.
  2. **Lift through heels:** Exhale as you drive through both heels until knees, hips, and shoulders align—avoid overarching your lower back.
  3. **Pause & lower:** Hold a 2-second squeeze at the top, lower smoothly, and rest 45–60 seconds between sets (progress to a 3-second lowering tempo on repeat runs).
* **Baseline Metrics & Tools:** `repetitions` (baseline `12`, required), `sets` (baseline `3`), `notes` (optional) · `COUNTER` (`{ step: 1 }`), `NOTES`
* **Media:** `illustrations/glute-bridge.jpg` (CC0-1.0)

### 6. `cool-down` — Cool-down (`5` min · `08:05`)
* **Category / Focuses:** `fitness` / `flexibility`, `general-fitness`
* **Summary:** Five minutes of slow nasal breathing and gentle stretching to lower heart rate and log session notes.
* **Instructions (3 steps):**
  1. **Slow your breathing:** Take 6 unhurried nasal breaths (4-second inhale, 6-second exhale).
  2. **Stretch worked muscles:** Hold a gentle chest opener, hip-flexor stretch, and seated hamstring stretch for 30–45 seconds per side without forcing range.
  3. **Record session feedback:** Log how the workout felt and any variation adjustment for your next session.
* **Baseline Metrics & Tools:** `duration` (`300` s, required), `completion` (`true`), `rating` (optional 1–5), `notes` (optional) · `TIMER` (`{ seconds: 300 }`), `NOTES`
* **Media:** `illustrations/cool-down.jpg` (CC0-1.0)

---

## Layer 3 — Schedule & 4-Week Progression (`ProgramScheduleItem.targetOverrides`)

* **Duration:** `28` days · **Frequency:** `N_PER_WEEK (3)` · **Mode:** `ALL_EACH_DAY` · **Calendar Presentation:** `GROUPED`
* **Workout Days (12 sessions):** Week 1 (`1, 3, 5`), Week 2 (`8, 10, 12`), Week 3 (`15, 17, 19`), Week 4 (`22, 24, 26`)
* **Session Window:** `07:30–08:10` (`5 + 9 + 9 + 5 + 7 + 5 = 40` minutes exact)

### Weekly Target Progression (`targetOverrides`)

| Week (Relative Days) | Phase | `warm-up` (07:30) | `squats` (07:35) | `push-ups` (07:44) | `plank` (07:53) | `glute-bridge` (07:58) | `cool-down` (08:05) |
|---|---|---|---|---|---|---|---|
| **Week 1** (`1, 3, 5`) | Learn Patterns | `300s` | `3 × 10` | `3 × 8` | `30s` | `3 × 10` | `300s` |
| **Week 2** (`8, 10, 12`) | Build Consistency | `300s` | `3 × 12` | `3 × 10` | `40s` | `3 × 12` | `300s` |
| **Week 3** (`15, 17, 19`) | Increase Volume | `300s` | `3 × 14` | `3 × 12` | `50s` | `3 × 14` | `300s` |
| **Week 4** (`22, 24, 26`) | Peak & Lock In | `300s` | `3 × 16` | `3 × 14` | `60s` | `3 × 16` | `300s` |

*(Each placement row carries `targetOverrides` for that week—e.g. `{ repetitions: 10, sets: 3 }` in Week 1 vs. `{ repetitions: 15, sets: 4 }` in Week 4—so the Activity definition stays untouched and actual user logs stay independent.)*

---

## Target Contract Preview (`ProgramContent` Shape)

Once approved, this text draft maps 1:1 to `ProgramContent` (with `sessionPresentation` and `placement.targetOverrides` added to the shared contract):

```ts
{
  slug: 'starter-beginner-core-strength',
  title: 'Beginner Core & Strength',
  categorySlug: 'fitness',
  programTypeSlug: 'workout',
  focusSlug: 'strength',
  level: 'BEGINNER',
  sessionMinutes: 40,
  sessionPresentation: 'GROUPED',
  tagSlugs: ['no-equipment', 'at-home', 'guided'],
  durationDays: 28,
  frequency: { kind: 'N_PER_WEEK', n: 3 },
  generationMode: 'ALL_EACH_DAY',
  visibility: 'PUBLIC',
  activitySlugs: ['warm-up', 'squats', 'push-ups', 'plank', 'glute-bridge', 'cool-down'],
  placements: [
    // Generated deterministically across Weeks 1–4 with weekly targetOverrides:
    // Week 1 (days 1,3,5): squats { repetitions: 10, sets: 3 }, push-ups { repetitions: 8, sets: 3 }, plank { duration: 30 }, glute-bridge { repetitions: 10, sets: 3 }
    // Week 2 (days 8,10,12): squats { repetitions: 12, sets: 3 }, push-ups { repetitions: 10, sets: 3 }, plank { duration: 40 }, glute-bridge { repetitions: 12, sets: 3 }
    // Week 3 (days 15,17,19): squats { repetitions: 15, sets: 3 }, push-ups { repetitions: 12, sets: 3 }, plank { duration: 50 }, glute-bridge { repetitions: 15, sets: 3 }
    // Week 4 (days 22,24,26): squats { repetitions: 15, sets: 4 }, push-ups { repetitions: 12, sets: 4 }, plank { duration: 60 }, glute-bridge { repetitions: 15, sets: 4 }
  ]
}
```
