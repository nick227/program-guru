// Platform administration (12-SOCIAL §7a). Every route here is adminOnlyAuth in the spec.
import { requireUser } from '../lib/auth'
import * as content from '../domains/admin/content.service'
import * as importer from '../domains/admin/import.service'
import * as users from '../domains/admin/users.service'
import * as membership from '../domains/admin/membership.service'

const uid = (request: any) => requireUser(request).id

export async function listAdminContent(request: any) {
  return content.list(request.query)
}
export async function importAdminContent(request: any) {
  return { data: await importer.importContent(uid(request), request.body) }
}
export async function moderateAdminContent(request: any) {
  return { data: await content.moderate(uid(request), request.params.kind, request.params.id, request.body) }
}
export async function listAdminAudit(request: any) {
  return content.auditLog(request.query)
}
export async function listAdminUsers(request: any) {
  return users.list(request.query)
}
export async function getAdminUser(request: any) {
  return { data: await users.get(request.params.userId) }
}
export async function updateAdminUser(request: any) {
  return { data: await users.update(uid(request), request.params.userId, request.body) }
}
export async function listAdminPrices(request: any) {
  return membership.prices(request.query)
}
export async function listAdminPurchases(request: any) {
  return membership.purchases(request.query)
}
export async function listAdminSubscriptions(request: any) {
  return membership.subscriptions(request.query)
}
export async function listAdminGrants(request: any) {
  return membership.grants(request.query)
}
