import { db } from '@project/db'
import { requireUser, resolveViewer } from '../lib/auth'
import { notFound } from '../lib/errors'
import { achievementInclude, toAchievement } from '../domains/calendar/achievements'
import { userIdForHandle } from '../domains/users/directory.service'

const uid = (request: any) => requireUser(request).id

export async function cancelCalendarItem(request: any) {
  return { data: await calendar.cancel(uid(request), request.params.itemId, request.query.scope) }
}
export async function endCalendarRecurrence(request: any) {
  return { data: await calendar.endRecurrence(uid(request), request.params.recurrenceId, request.query.effectiveFromDate) }
}

export async function listMyAchievements(request: any) {
  const rows = await db.userAchievement.findMany({ where: { userId: uid(request), revokedAt: null }, orderBy: { earnedAt: 'desc' }, include: achievementInclude })
  return { data: rows.map(toAchievement) }
}
export async function updateMyAchievement(request: any) {
  const a = await db.userAchievement.findUnique({ where: { id: request.params.achievementId } })
  if (!a || a.userId !== uid(request) || a.revokedAt) throw notFound('Achievement')
  const row = await db.userAchievement.update({ where: { id: a.id }, data: { isShared: request.body.isShared }, include: achievementInclude })
  return { data: toAchievement(row) }
}
export async function listUserAchievements(request: any) {
  const viewer = await resolveViewer(request)
  const profile = await userIdForHandle(viewer?.id ?? null, request.params.handle)
  // Private until the user shares them (09 §9a).
  const rows = await db.userAchievement.findMany({ where: { userId: profile.userId, isShared: true, revokedAt: null }, orderBy: { earnedAt: 'desc' }, include: achievementInclude })
  return { data: rows.map(toAchievement) }
}
