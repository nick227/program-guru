import { requireUser, resolveViewer } from '../lib/auth'
import { authenticatedHandler } from '../lib/operation-handler'
import * as authoring from '../domains/programs/authoring.service'
import * as browse from '../domains/programs/browse.service'
import * as enrollment from '../domains/programs/enrollment.service'
import * as slugService from '../domains/programs/slug.service'
import * as programDeletion from '../domains/programs/delete.service'

const uid = (request: any) => requireUser(request).id

export async function resolveSlug(request: any) {
  const viewer = await resolveViewer(request)
  const { kind, slugOrId, creatorHandle } = request.query
  return {
    data: await slugService.resolveSlug(viewer?.id ?? null, {
      kind,
      slugOrId,
      creatorHandle,
    }),
  }
}

export async function listMyPrograms(request: any) {
  return authoring.listMine(uid(request), request.query)
}
export const createProgram = authenticatedHandler('createProgram', ({ userId, body }) => authoring.create(userId, body))
export async function getProgramPreview(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await browse.preview(viewer?.id ?? null, request.params.programId) }
}
export const getProgramWorkspace = authenticatedHandler('getProgramWorkspace', ({ userId, params }) => authoring.workspace(userId, params.programId))
export async function updateProgramDraft(request: any) {
  return { data: await authoring.updateDraft(uid(request), request.params.programId, request.body) }
}
export async function updateProgramVisibility(request: any) {
  return { data: await authoring.updateVisibility(uid(request), request.params.programId, request.body) }
}
export async function addProgramActivities(request: any) {
  return { data: await authoring.addActivities(uid(request), request.params.programId, request.body) }
}
export async function updateProgramActivity(request: any) {
  const { programId, activityId } = request.params
  return { data: await authoring.updateActivity(uid(request), programId, activityId, request.body) }
}
export async function removeProgramActivity(request: any) {
  const { programId, activityId } = request.params
  return { data: await authoring.removeActivity(uid(request), programId, activityId, request.query.expectedRevision) }
}
export async function listProgramPlacements(request: any) {
  return { data: await authoring.listPlacements(uid(request), request.params.programId) }
}
export async function addProgramPlacement(request: any) {
  return { data: await authoring.addPlacement(uid(request), request.params.programId, request.body) }
}
export async function updateProgramPlacement(request: any) {
  const { programId, placementId } = request.params
  return { data: await authoring.updatePlacement(uid(request), programId, placementId, request.body) }
}
export async function deleteProgramPlacement(request: any) {
  const { programId, placementId } = request.params
  await authoring.deletePlacement(uid(request), programId, placementId, request.query.expectedRevision)
  return { data: { ok: true } }
}
export async function regenerateProgramSchedule(request: any) {
  return { data: await authoring.regenerateSchedule(uid(request), request.params.programId, request.body) }
}
export const getProgramPublishCheck = authenticatedHandler('getProgramPublishCheck', ({ userId, params }) => authoring.publishCheck(userId, params.programId))
export async function publishProgram(request: any) {
  return { data: await authoring.publish(uid(request), request.params.programId, request.body) }
}
export const archiveProgram = authenticatedHandler('archiveProgram', ({ userId, params }) => authoring.archive(userId, params.programId))
export async function deleteProgram(request: any) {
  return { data: await programDeletion.deleteProgram(uid(request), request.params.programId) }
}
export const copyProgram = authenticatedHandler('copyProgram', ({ userId, params }) => authoring.copy(userId, params.programId))
export async function setProgramPrices(request: any) {
  return { data: await authoring.setPrices(uid(request), request.params.programId, request.body) }
}
export const getProgramVersion = authenticatedHandler('getProgramVersion', ({ userId, params }) => browse.versionDetail(userId, params.versionId))
export async function previewEnrollment(request: any) {
  return { data: await enrollment.preview(uid(request), request.params.programId, request.body) }
}
export async function joinProgram(request: any) {
  return { data: await enrollment.join(uid(request), request.params.programId, request.body) }
}
export async function listMyEnrollments(request: any) {
  return enrollment.list(uid(request), request.query)
}
export const getEnrollment = authenticatedHandler('getEnrollment', ({ userId, params }) => enrollment.get(userId, params.enrollmentId))
export async function updateEnrollment(request: any) {
  return { data: await enrollment.setStatus(uid(request), request.params.enrollmentId, request.body.status) }
}
export async function leaveEnrollment(request: any) {
  return { data: await enrollment.leave(uid(request), request.params.enrollmentId, request.body.futureItems) }
}
export const acceptEnrollmentUpdate = authenticatedHandler('acceptEnrollmentUpdate', ({ userId, params }) => enrollment.acceptUpdate(userId, params.enrollmentId))
export const dismissEnrollmentUpdate = authenticatedHandler('dismissEnrollmentUpdate', ({ userId, params }) => enrollment.dismissUpdate(userId, params.enrollmentId))
export const createProgramAccessRequest = authenticatedHandler('createProgramAccessRequest', ({ userId, params }) => enrollment.requestAccess(userId, params.programId))
export async function listProgramAccessRequests(request: any) {
  return enrollment.listAccessRequests(uid(request), request.params.programId, request.query)
}
export async function approveProgramAccessRequest(request: any) {
  return { data: await enrollment.resolveAccessRequest(uid(request), request.params.requestId, 'APPROVED') }
}
export async function declineProgramAccessRequest(request: any) {
  return { data: await enrollment.resolveAccessRequest(uid(request), request.params.requestId, 'DECLINED') }
}

import * as personalLibrary from '../domains/programs/library.service'
export const getPersonalProgramLibrary = authenticatedHandler('getPersonalProgramLibrary', ({ userId }) => personalLibrary.library(userId))
export async function managePersonalProgram(request: any) { return { data: await personalLibrary.manageLibrary(uid(request), request.params.programId, request.body) } }
