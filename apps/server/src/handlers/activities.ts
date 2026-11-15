import { listAttempts } from '../domains/activities/history.service'
import { participation } from '../domains/activities/participation.service'
import { requireUser, resolveViewer } from '../lib/auth'
import * as activities from '../domains/activities/activity.service'

export async function listActivities(request: any) {
  const viewer = await resolveViewer(request)
  return activities.list(viewer?.id ?? null, request.query)
}

export async function getActivity(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await activities.getDetail(viewer?.id ?? null, request.params.activityId, request.query.revisionId) }
}

export async function copyActivity(request: any) {
  return { data: await activities.copy(requireUser(request).id, request.params.activityId, request.body ?? {}) }
}

export async function listActivityMyAttempts(request: any) {
  return listAttempts(requireUser(request).id, request.params.activityId, request.query)
}

/** Participation for several Activities at once (03-UX §2b, 12 §10a); signed out, `viewer` is null. */
export async function listActivityParticipation(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await participation(viewer?.id ?? null, request.query.ids) }
}
