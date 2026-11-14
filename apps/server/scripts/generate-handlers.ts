// Generated handler bindings: OpenAPI owns operation IDs and types; manifests only map services.
// Keep special response shapes and optional-viewer operations as handwritten handlers.
import { load } from 'js-yaml'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const bindings = {
  acceptEnrollmentUpdate: ["enrollment.acceptUpdate", "userId", "params.enrollmentId"],
  addProgramActivities: ["authoring.addActivities", "userId", "params.programId", "body"],
  addProgramPlacement: ["authoring.addPlacement", "userId", "params.programId", "body"],
  archiveProgram: ["authoring.archive", "userId", "params.programId"],
  copyProgram: ["authoring.copy", "userId", "params.programId"],
  createProgram: ["authoring.create", "userId", "body"],
  createProgramAccessRequest: ["enrollment.requestAccess", "userId", "params.programId"],
  deleteProgram: ["programDeletion.deleteProgram", "userId", "params.programId"],
  dismissEnrollmentUpdate: ["enrollment.dismissUpdate", "userId", "params.enrollmentId"],
  getEnrollment: ["enrollment.get", "userId", "params.enrollmentId"],
  getPersonalProgramLibrary: ["personalLibrary.library", "userId"],
  getProgramPublishCheck: ["authoring.publishCheck", "userId", "params.programId"],
  getProgramVersion: ["browse.versionDetail", "userId", "params.versionId"],
  getProgramWorkspace: ["authoring.workspace", "userId", "params.programId"],
  joinProgram: ["enrollment.join", "userId", "params.programId", "body"],
  leaveEnrollment: ["enrollment.leave", "userId", "params.enrollmentId", "body.futureItems"],
  listProgramPlacements: ["authoring.listPlacements", "userId", "params.programId"],
  managePersonalProgram: ["personalLibrary.manageLibrary", "userId", "params.programId", "body"],
  previewEnrollment: ["enrollment.preview", "userId", "params.programId", "body"],
  publishProgram: ["authoring.publish", "userId", "params.programId", "body"],
  regenerateProgramSchedule: ["authoring.regenerateSchedule", "userId", "params.programId", "body"],
  setProgramPrices: ["authoring.setPrices", "userId", "params.programId", "body"],
  updateEnrollment: ["enrollment.setStatus", "userId", "params.enrollmentId", "body.status"],
  updateProgramActivity: ["authoring.updateActivity", "userId", "params.programId", "params.activityId", "body"],
  updateProgramDraft: ["authoring.updateDraft", "userId", "params.programId", "body"],
  updateProgramPlacement: ["authoring.updatePlacement", "userId", "params.programId", "params.placementId", "body"],
  updateProgramVisibility: ["authoring.updateVisibility", "userId", "params.programId", "body"],
} as const
const domains = {
  programs: {
    services: {
      authoring: 'authoring.service',
      browse: 'browse.service',
      enrollment: 'enrollment.service',
      programDeletion: 'delete.service',
      personalLibrary: 'library.service',
    },
    bindings,
  },
  activities: {
    services: { activities: 'activity.service' },
    bindings: {
    archiveActivity: ["activities.archive", "userId", "params.activityId"],
    createActivity: ["activities.create", "userId", "body"],
    publishActivity: ["activities.publishActivity", "userId", "params.activityId", "body"],
    putActivityInstructions: ["activities.putInstructions", "userId", "params.activityId", "body"],
    putActivityMetrics: ["activities.putMetrics", "userId", "params.activityId", "body"],
    putActivityTools: ["activities.putTools", "userId", "params.activityId", "body"],
    updateActivityDraft: ["activities.updateDraft", "userId", "params.activityId", "body"],
    },
  },
  calendar: {
    services: {
      calendar: 'calendar.service',
      sessions: 'session.service',
      occurrenceService: 'occurrence.service',
    },
    bindings: {
    addCalendarItem: ["calendar.add", "userId", "body"],
    applySessionAction: ["sessions.act", "userId", "params.sessionId", "body"],
    createSession: ["sessions.create", "userId", "body"],
    getActivityMyStats: ["occurrenceService.personalStats", "userId", "params.activityId"],
    getActivityOccurrence: ["occurrenceService.occurrence", "userId", "params.itemId"],
    getSession: ["sessions.get", "userId", "params.sessionId"],
    listCalendarItems: ["calendar.list", "userId", "query"],
    listCalendarRecurrences: ["calendar.listRecurrences", "userId"],
    moveCalendarItemToOpenSlot: ["calendar.moveToOpenSlot", "userId", "params.itemId"],
    saveSessionResult: ["sessions.saveResult", "userId", "params.sessionId", "body"],
    undoCalendarItemCompletion: ["calendar.undoCompletion", "userId", "params.itemId"],
    updateCalendarItem: ["calendar.update", "userId", "params.itemId", "body"],
    updateCalendarRecurrence: ["calendar.updateRecurrence", "userId", "params.recurrenceId", "body"],
    },
  },
  groups: {
    services: { groups: 'group.service' },
    bindings: {
      addCompletionComment: ["groups.addCompletionComment", "userId", "params.shareId", "body"],
      addCompletionReaction: ["groups.react", "userId", "params.shareId", "body.emoji", "body.idempotencyKey"],
      createCheckIns: ["groups.createCheckIns", "userId", "body"],
      createGroup: ["groups.create", "userId", "body"],
      createGroupInvitation: ["groups.invite", "userId", "params.groupId", "body"],
      getGroup: ["groups.get", "userId", "params.groupId"],
      listGroupInvitations: ["groups.listInvitations", "userId", "params.groupId"],
      updateGroup: ["groups.update", "userId", "params.groupId", "body"],
      updateMyGroupMembership: ["groups.updateMyMembership", "userId", "params.groupId", "body"],
    },
  },
  users: {
    services: { profiles: 'profile.service', follows: 'follow.service' },
    bindings: {
      followUser: ["follows.follow", "userId", "params.userId"],
      unfollowUser: ["follows.unfollow", "userId", "params.userId"],
      updateMyPreferences: ["profiles.updatePreferences", "userId", "body"],
      updateMyProfile: ["profiles.updateProfile", "userId", "body"],
    },
  },
  catalog: {
    services: { catalog: 'catalog.service' },
    bindings: {
      createCustomFocus: ["catalog.createCustomFocus", "userId", "body"],
      createCustomProgramType: ["catalog.createCustomProgramType", "userId", "body"],
    },
  },
} as const

const root = resolve(__dirname, '../../..')
const spec = load(readFileSync(resolve(root, 'packages/api-spec/openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, { operationId?: string }>>
}
const operations = new Set(Object.values(spec.paths).flatMap(path =>
  Object.values(path).map(operation => operation?.operationId).filter((id): id is string => !!id),
))
const argumentPattern = /^(userId|body(?:\.[A-Za-z]\w*)?|params\.[A-Za-z]\w*|query(?:\.[A-Za-z]\w*)?)$/
const seen = new Set<string>()
for (const [domain, config] of Object.entries(domains)) {
  const serviceNames: Record<string, string> = config.services
  const lines = [
    '// GENERATED by scripts/generate-handlers.ts. Do not edit.',
    "import { authenticatedHandler } from '../lib/operation-handler'",
    ...Object.entries(serviceNames).map(([alias, file]) =>
      `import * as ${alias} from '../domains/${domain}/${file}'`),
    '',
  ]
  for (const [operationId, [method, ...args]] of Object.entries(config.bindings)) {
    if (!operations.has(operationId)) throw new Error(`Unknown OpenAPI operationId: ${operationId}`)
    if (seen.has(operationId)) throw new Error(`Duplicate generated operationId: ${operationId}`)
    seen.add(operationId)
    const [service, fn, ...rest] = method.split('.')
    if (rest.length || !fn || !/^[A-Za-z]\w*$/.test(fn) || !Object.hasOwn(serviceNames, service) ||
      args.some(arg => !argumentPattern.test(arg)))
      throw new Error(`Invalid binding for ${operationId}`)
    lines.push(`export const ${operationId} = authenticatedHandler('${operationId}', ctx => ${method}(${args.map(arg => `ctx.${arg}`).join(', ')}))`)
  }
  const destination = resolve(root, `apps/server/src/handlers/${domain}.generated.ts`)
  const output = lines.join('\n') + '\n'
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== output)
      throw new Error(`Generated ${domain} handlers are stale: run pnpm --filter server handlers:generate`)
  } else writeFileSync(destination, output)
  console.log(`✓ ${Object.keys(config.bindings).length} ${domain} handlers ${process.argv.includes('--check') ? 'checked' : 'generated'}`)
}
