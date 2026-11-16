import { requireUser, resolveViewer } from '../lib/auth'
import * as places from '../domains/catalog/place.service'
import * as catalog from '../domains/catalog/catalog.service'

export async function listCategories() {
  return { data: await catalog.listCategories() }
}

export async function listProgramTypes(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await catalog.listProgramTypes(viewer?.id ?? null, request.query.categoryId) }
}

export async function listFocuses(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await catalog.listFocuses(viewer?.id ?? null, request.query) }
}

export async function listMetricDefinitions(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await catalog.listMetricDefinitions(viewer?.id ?? null, request.query.q) }
}

export async function listToolDefinitions() {
  return { data: await catalog.listToolDefinitions() }
}

export async function listTags() {
  return { data: await catalog.listTags() }
}

export async function listPlaces(request: any) {
  const viewer = await resolveViewer(request)
  return catalog.listPlaces(viewer?.id ?? null, request.query)
}

export async function getPlace(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await catalog.getPlace(request.params.placeRef, viewer?.id ?? null) }
}

export async function createPlace(request: any, reply: any) {
  const data = await places.createPlace(requireUser(request).id, request.body)
  reply.code(201)
  return { data }
}
export async function updatePlace(request: any) {
  return { data: await places.updatePlace(requireUser(request).id, request.params.placeRef, request.body) }
}
export async function associatePlaceBusiness(request: any) {
  return { data: await places.associatePlace(requireUser(request).id, request.params.placeId, request.body) }
}
