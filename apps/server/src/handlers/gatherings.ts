// Standalone Activity gatherings (10-COLLABORATION §9).
import { requireUser, resolveViewer } from '../lib/auth'
import * as gatherings from '../domains/groups/gathering.service'

const uid = (request: any) => requireUser(request).id
const viewerId = async (request: any) => (await resolveViewer(request))?.id ?? null

export async function listActivityGatherings(request: any) {
  return { data: await gatherings.listForActivity(await viewerId(request), request.params.activityId) }
}
export async function createGathering(request: any) {
  return { data: await gatherings.create(uid(request), request.params.activityId, request.body) }
}
export async function listGatherings(request: any) {
  return { data: await gatherings.listPublic(await viewerId(request), request.query) }
}
export async function getGathering(request: any) {
  return { data: await gatherings.get(await viewerId(request), request.params.gatheringId, request.query.invite) }
}
export async function updateGathering(request: any) {
  return { data: await gatherings.update(uid(request), request.params.gatheringId, request.body) }
}
export async function joinGathering(request: any) {
  return { data: await gatherings.join(uid(request), request.params.gatheringId, request.body) }
}
export async function leaveGathering(request: any) {
  return { data: await gatherings.leave(uid(request), request.params.gatheringId) }
}
export async function createGatheringLink(request: any) {
  return { data: await gatherings.createLink(uid(request), request.params.gatheringId) }
}
