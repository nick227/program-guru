import { listAttempts } from '../domains/activities/history.service'
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
