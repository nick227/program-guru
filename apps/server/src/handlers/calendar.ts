import { db } from '@project/db'
import { requireUser, resolveViewer } from '../lib/auth'
import { notFound } from '../lib/errors'
import * as calendar from '../domains/calendar/calendar.service'
import * as sessions from '../domains/calendar/session.service'
import { occurrence, personalStats } from '../domains/calendar/occurrence.service'
import { achievementInclude, toAchievement } from '../domains/calendar/achievements'
import { userIdForHandle } from '../domains/users/directory.service'

const uid = (request: any) => requireUser(request).id

export async function listCalendarItems(request: any) {
  return { data: await calendar.list(uid(request), request.query) }
}
export async function addCalendarItem(request: any) {
  return { data: await calendar.add(uid(request), request.body) }
}
export async function getActivityOccurrence(request: any) {
  return { data: await occurrence(uid(request), request.params.itemId) }
}
export async function updateCalendarItem(request: any) {
  return { data: await calendar.update(uid(request), request.params.itemId, request.body) }
}
export async function cancelCalendarItem(request: any) {
  return { data: await calendar.cancel(uid(request), request.params.itemId, request.query.scope) }
}
export async function moveCalendarItemToOpenSlot(request: any) {
  return { data: await calendar.moveToOpenSlot(uid(request), request.params.itemId) }
}
export async function undoCalendarItemCompletion(request: any) {
  return { data: await calendar.undoCompletion(uid(request), request.params.itemId) }
}
export async function listCalendarRecurrences(request: any) {
  return { data: await calendar.listRecurrences(uid(request)) }
}
export async function updateCalendarRecurrence(request: any) {
  return { data: await calendar.updateRecurrence(uid(request), request.params.recurrenceId, request.body) }
}
export async function endCalendarRecurrence(request: any) {
  return { data: await calendar.endRecurrence(uid(request), request.params.recurrenceId, request.query.effectiveFromDate) }
}

export async function createSession(request: any) {
  return { data: await sessions.create(uid(request), request.body) }
}
export async function getSession(request: any) {
  return { data: await sessions.get(uid(request), request.params.sessionId) }
}
export async function applySessionAction(request: any) {
  return { data: await sessions.act(uid(request), request.params.sessionId, request.body) }
}
export async function saveSessionResult(request: any) {
  return { data: await sessions.saveResult(uid(request), request.params.sessionId, request.body) }
}
export async function getActivityMyStats(request: any) {
  return { data: await personalStats(uid(request), request.params.activityId) }
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
