import { requireUser, resolveViewer } from '../lib/auth'
import * as authoring from '../domains/programs/authoring.service'
import * as browse from '../domains/programs/browse.service'
import * as enrollment from '../domains/programs/enrollment.service'
import * as slugService from '../domains/programs/slug.service'

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
export async function getProgramPreview(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await browse.preview(viewer?.id ?? null, request.params.programId) }
}
export async function removeProgramActivity(request: any) {
  const { programId, activityId } = request.params
  return { data: await authoring.removeActivity(uid(request), programId, activityId, request.query.expectedRevision) }
}
export async function deleteProgramPlacement(request: any) {
  const { programId, placementId } = request.params
  await authoring.deletePlacement(uid(request), programId, placementId, request.query.expectedRevision)
  return { data: { ok: true } }
}
export async function listMyEnrollments(request: any) {
  return enrollment.list(uid(request), request.query)
}
export async function listProgramAccessRequests(request: any) {
  return enrollment.listAccessRequests(uid(request), request.params.programId, request.query)
}
export async function approveProgramAccessRequest(request: any) {
  return { data: await enrollment.resolveAccessRequest(uid(request), request.params.requestId, 'APPROVED') }
}
export async function declineProgramAccessRequest(request: any) {
  return { data: await enrollment.resolveAccessRequest(uid(request), request.params.requestId, 'DECLINED') }
}

