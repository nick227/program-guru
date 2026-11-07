import { requireUser, resolveViewer } from '../lib/auth'
import * as activities from '../domains/activities/activity.service'

export async function listActivities(request: any) {
  const viewer = await resolveViewer(request)
  return activities.list(viewer?.id ?? null, request.query)
}

export async function createActivity(request: any) {
  return { data: await activities.create(requireUser(request).id, request.body) }
}

export async function getActivity(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await activities.getDetail(viewer?.id ?? null, request.params.activityId, request.query.revisionId) }
}

export async function updateActivityDraft(request: any) {
  return { data: await activities.updateDraft(requireUser(request).id, request.params.activityId, request.body) }
}

export async function putActivityInstructions(request: any) {
  return { data: await activities.putInstructions(requireUser(request).id, request.params.activityId, request.body) }
}

export async function putActivityMetrics(request: any) {
  return { data: await activities.putMetrics(requireUser(request).id, request.params.activityId, request.body) }
}

export async function putActivityTools(request: any) {
  return { data: await activities.putTools(requireUser(request).id, request.params.activityId, request.body) }
}

export async function copyActivity(request: any) {
  return { data: await activities.copy(requireUser(request).id, request.params.activityId, request.body ?? {}) }
}

export async function publishActivity(request: any) {
  return { data: await activities.publishActivity(requireUser(request).id, request.params.activityId, request.body) }
}

export async function archiveActivity(request: any) {
  return { data: await activities.archive(requireUser(request).id, request.params.activityId) }
}
