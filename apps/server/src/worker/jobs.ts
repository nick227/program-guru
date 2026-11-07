// Scheduled worker jobs: reminders, calendar horizons, ranking statistics, and cleanup.
// Each job is idempotent so overlapping runs or restarts never double-send or duplicate rows.
import { Prisma, db } from '@project/db'
import { email, layout } from '../infrastructure/email'
import { storage } from '../infrastructure/storage'
import { addDays, fromDbDate, todayIn, toDbDate } from '../lib/time'
import { HORIZON_DAYS, materializeEnrollment } from '../domains/calendar/materialize'
import { materializeRecurrence } from '../domains/calendar/recurrence'
import { unsubscribeToken } from '../domains/social/notification.service'
import { appUrl } from './handlers'
import { notify } from './notify'

const REMINDER_GRACE_MS = 30 * 60_000 // never remind about something more than 30 minutes past

/** Local wall-clock "HH:mm" in a timezone. */
function localTime(timeZone: string, now: Date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

/** Timed items due now get one in-app reminder (12 §6). */
export async function timedReminders(now = new Date()) {
  const due = await db.calendarItem.findMany({
    where: {
      status: 'PLANNED',
      reminderSentAt: null,
      scheduledAtUtc: { lte: now, gte: new Date(now.getTime() - REMINDER_GRACE_MS) },
      OR: [{ enrollmentId: null }, { enrollment: { status: 'ACTIVE' } }],
    },
    include: { revision: true },
    take: 500,
  })
  let sent = 0
  for (const item of due) {
    // Claim first: only one worker sends for this item.
    const claimed = await db.calendarItem.updateMany({ where: { id: item.id, reminderSentAt: null }, data: { reminderSentAt: now } })
    if (!claimed.count) continue
    const ok = await notify({
      recipientId: item.ownerId,
      type: 'ACTIVITY_REMINDER',
      title: `Time for ${item.revision.titleSnapshot}`,
      deepLink: `/occurrences/${item.id}`,
      entityKind: 'CALENDAR_ITEM',
      entityId: item.id,
      dedupeKey: `reminder:${item.id}:${item.scheduledAtUtc!.toISOString()}`,
    })
    if (ok) sent++
  }
  return sent
}

/**
 * Daily summary at each user's chosen local time: in-app by default, email only if opted in.
 * Only on days with planned items. ReminderDispatch is claimed before sending (12 §6).
 */
export async function dailySummaries(now = new Date()) {
  const users = await db.userPreference.findMany({
    where: { OR: [{ inAppRemindersEnabled: true }, { dailyEmailEnabled: true }], user: { status: 'ACTIVE' } },
    include: { user: true },
  })
  let sent = 0
  for (const prefs of users) {
    if (localTime(prefs.timezone, now) < prefs.dailyReminderTime) continue
    const today = todayIn(prefs.timezone, now)
    const items = await db.calendarItem.findMany({
      where: { ownerId: prefs.userId, status: 'PLANNED', localDate: toDbDate(today), OR: [{ enrollmentId: null }, { enrollment: { status: 'ACTIVE' } }] },
      include: { revision: true },
      orderBy: [{ localTime: { sort: 'asc', nulls: 'last' } }],
    })
    if (!items.length) continue
    const count = items.length
    const title = `${count} ${count === 1 ? 'activity' : 'activities'} today`
    const channels = [...(prefs.inAppRemindersEnabled ? (['IN_APP'] as const) : []), ...(prefs.dailyEmailEnabled ? (['EMAIL'] as const) : [])]
    for (const channel of channels) {
      try {
        await db.reminderDispatch.create({ data: { userId: prefs.userId, localDate: toDbDate(today), channel } })
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue // already sent today
        throw err
      }
      if (channel === 'IN_APP') {
        await notify({ recipientId: prefs.userId, type: 'DAILY_SUMMARY', title, deepLink: `/?day=${today}`, entityKind: 'CALENDAR_DAY', entityId: prefs.userId, dedupeKey: `daily:${prefs.userId}:${today}` })
      } else {
        const unsubscribe = appUrl(`/unsubscribe?token=${encodeURIComponent(unsubscribeToken(prefs.userId))}`)
        // Activity titles only: never results, amounts, notes, or health details (12 §6).
        const { text, html } = layout({
          heading: title,
          lines: items.slice(0, 10).map((i) => (i.localTime ? `${i.localTime} · ${i.revision.titleSnapshot}` : i.revision.titleSnapshot)),
          action: { label: 'Open your calendar', url: appUrl(`/?day=${today}`) },
          footer: `You chose a daily reminder at ${prefs.dailyReminderTime}. Unsubscribe: ${unsubscribe}`,
        })
        await email().send({
          to: prefs.user.email,
          subject: title,
          text,
          html,
          headers: { 'List-Unsubscribe': `<${unsubscribe}>` },
          idempotencyKey: `daily:${prefs.userId}:${today}`,
        })
      }
      sent++
    }
  }
  return sent
}

/** Keeps every live enrollment and recurrence generated 12 weeks ahead (05 §9). */
export async function extendHorizons(now = new Date()) {
  let created = 0
  const enrollments = await db.programEnrollment.findMany({
    where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    include: { version: { include: { items: true } } },
  })
  for (const e of enrollments) {
    const through = addDays(todayIn(e.timezone, now), HORIZON_DAYS)
    const start = fromDbDate(e.startLocalDate)
    const end = e.version.durationDays !== null ? addDays(start, e.version.durationDays - 1) : null
    const generated = e.generatedThroughDate ? fromDbDate(e.generatedThroughDate) : null
    if (generated && (generated >= through || (end && generated >= end))) continue
    const from = generated ? addDays(generated, 1) : start
    created += await db.$transaction((tx) => materializeEnrollment(tx, e, e.version, e.version.items, { from, through }), { timeout: 30_000 })
  }
  const recurrences = await db.calendarRecurrence.findMany({ where: { status: 'ACTIVE' } })
  for (const r of recurrences) {
    const through = addDays(todayIn(r.timezone, now), HORIZON_DAYS)
    const generated = r.generatedThroughDate ? fromDbDate(r.generatedThroughDate) : null
    if (generated && generated >= through) continue
    if (r.untilDate && generated && generated >= fromDbDate(r.untilDate)) continue
    created += await db.$transaction((tx) => materializeRecurrence(tx, r, { from: generated ? addDays(generated, 1) : fromDbDate(r.anchorDate), through }))
  }
  return created
}

const MIN_SAMPLE = 5

/**
 * Program quality signals (decision 19): completion rate over items already due, and 30-day
 * retention (enrollments at least 30 days old with a completion in the last 30 days). rankScore
 * blends them with a damped popularity term; small samples count for nothing (12 §10).
 */
export async function programStats(now = new Date()) {
  const programs = await db.program.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } })
  const today = toDbDate(now.toISOString().slice(0, 10))
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000)
  for (const { id } of programs) {
    const enrollmentCount = await db.programEnrollment.count({ where: { programId: id } })
    const [due, done] = await Promise.all([
      db.calendarItem.count({ where: { enrollment: { programId: id }, status: { not: 'CANCELLED' }, localDate: { lt: today } } }),
      db.calendarItem.count({ where: { enrollment: { programId: id }, status: 'DONE', localDate: { lt: today } } }),
    ])
    const mature = await db.programEnrollment.findMany({ where: { programId: id, createdAt: { lte: thirtyAgo } }, select: { id: true } })
    const retained = mature.length
      ? await db.programEnrollment.count({ where: { id: { in: mature.map((m) => m.id) }, calendarItems: { some: { status: 'DONE', updatedAt: { gte: thirtyAgo } } } } })
      : 0
    const completionRate = due >= MIN_SAMPLE ? done / due : null
    const retention30d = mature.length >= MIN_SAMPLE ? retained / mature.length : null
    const rankScore = enrollmentCount >= MIN_SAMPLE ? (completionRate ?? 0) * 50 + (retention30d ?? 0) * 40 + Math.log10(1 + enrollmentCount) * 10 : 0
    await db.programStat.upsert({
      where: { programId: id },
      create: { programId: id, enrollmentCount, completionRate, retention30d, rankScore, computedAt: now },
      update: { enrollmentCount, completionRate, retention30d, rankScore, computedAt: now },
    })
  }
  // Public media rank (11 §5): popularity damped by age, a boost for quality review; never popularity alone.
  await db.$executeRaw`
    UPDATE MediaPublication
    SET rankScore = (likeCount * 3 + LEAST(viewCount, 10000) * 0.2 + IF(qualityReviewedAt IS NULL, 0, 20))
                    / SQRT(GREATEST(TIMESTAMPDIFF(DAY, COALESCE(publishedAt, createdAt), ${now}), 0) + 2)
    WHERE audience = 'PUBLIC' AND status = 'APPROVED'`
  return programs.length
}

const RETENTION_DAYS = Number(process.env.MEDIA_RETENTION_DAYS ?? 30)

/** Expired sessions, idempotency keys, abandoned uploads, and deleted media past retention. */
export async function cleanup(now = new Date()) {
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } })
  await db.idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } })
  await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } } })
  const abandoned = await db.mediaAsset.findMany({ where: { state: 'UPLOADING', uploadExpiresAt: { lt: new Date(now.getTime() - 3600_000) } } })
  for (const m of abandoned) {
    await storage().remove(m.originalStorageKey).catch(() => {})
    await db.mediaAsset.update({ where: { id: m.id }, data: { state: 'FAILED', uploadExpiresAt: null } })
  }
  const purge = await db.mediaAsset.findMany({ where: { deletedAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) }, ownerId: { not: null } }, include: { variants: true } })
  for (const m of purge) {
    for (const key of [m.originalStorageKey, ...m.variants.map((v) => v.storageKey)]) await storage().remove(key).catch(() => {})
    await db.mediaVariant.deleteMany({ where: { mediaId: m.id } })
  }
  return { abandoned: abandoned.length, purged: purge.length }
}
