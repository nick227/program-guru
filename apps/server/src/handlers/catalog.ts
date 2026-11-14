import { requireUser, resolveViewer } from '../lib/auth'
import * as catalog from '../domains/catalog/catalog.service'

export async function listCategories() {
  return { data: await catalog.listCategories() }
}

export async function listProgramTypes(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await catalog.listProgramTypes(viewer?.id ?? null, request.query.categoryId) }
}

export async function createCustomProgramType(request: any) {
  return { data: await catalog.createCustomProgramType(requireUser(request).id, request.body) }
}

export async function listFocuses(request: any) {
  const viewer = await resolveViewer(request)
  return { data: await catalog.listFocuses(viewer?.id ?? null, request.query) }
}

export async function createCustomFocus(request: any) {
  return { data: await catalog.createCustomFocus(requireUser(request).id, request.body) }
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
  return { data: await catalog.listPlaces({ q: request.query.q, locality: request.query.locality }) }
}

export async function getPlace(request: any) {
  return { data: await catalog.getPlace(request.params.placeRef) }
}
