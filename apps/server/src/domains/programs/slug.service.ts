import { randomUUID } from 'crypto'
import { db, type Prisma } from '@project/db'
import { notFound } from '../../lib/errors'
import { canSeeProgram, isProgramOwner } from './access'
import { programInclude } from './mapper'
import { isOpenlyReadable, isOwner } from '../activities/access'
import { activityInclude } from '../activities/mapper'
import { isBlockedEitherWay } from '../users/follow.service'

type Tx = Prisma.TransactionClient

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return slug || 'item'
}

/**
 * Allocates a unique slug for a program within the creator's namespace (or platform if creatorId is null).
 * If the program already had a slug and it is changing, records the old slug as an alias in ProgramSlugAlias.
 */
export async function allocateProgramSlug(
  tx: Tx,
  opts: { programId: string; creatorId: string | null; title: string },
): Promise<string> {
  const base = slugify(opts.title)
  const current = await tx.program.findUnique({
    where: { id: opts.programId },
    select: { slug: true },
  })

  // If current slug already matches base, keep it
  if (current?.slug === base) {
    return base
  }

  // Find candidate slug that is free for this creator (both in Program and ProgramSlugAlias)
  let candidate = base
  let counter = 1

  while (true) {
    const [existingProgram, existingAlias] = await Promise.all([
      tx.program.findFirst({
        where: {
          creatorId: opts.creatorId,
          slug: candidate,
          id: { not: opts.programId },
        },
        select: { id: true },
      }),
      tx.programSlugAlias.findFirst({
        where: {
          creatorId: opts.creatorId,
          slug: candidate,
          programId: { not: opts.programId },
        },
        select: { id: true },
      }),
    ])

    if (!existingProgram && !existingAlias) {
      break
    }
    counter++
    candidate = `${base}-${counter}`
  }

  // If the program had a previous slug and it is changing, save old slug as an alias
  if (current?.slug && current.slug !== candidate) {
    const existingOldAlias = await tx.programSlugAlias.findFirst({
      where: { creatorId: opts.creatorId, slug: current.slug },
    })
    if (!existingOldAlias) {
      await tx.programSlugAlias.create({
        data: {
          id: randomUUID(),
          programId: opts.programId,
          creatorId: opts.creatorId,
          slug: current.slug,
        },
      })
    } else if (existingOldAlias.programId !== opts.programId) {
      await tx.programSlugAlias.update({
        where: { id: existingOldAlias.id },
        data: { programId: opts.programId },
      })
    }
  }

  // If candidate was previously an alias pointing to this program, delete it
  await tx.programSlugAlias.deleteMany({
    where: { creatorId: opts.creatorId, slug: candidate, programId: opts.programId },
  })

  await tx.program.update({
    where: { id: opts.programId },
    data: { slug: candidate },
  })

  return candidate
}

/**
 * Allocates a unique slug for an activity across all activities.
 * If the activity already had a slug and it is changing, records the old slug as an alias in ActivitySlugAlias.
 */
export async function allocateActivitySlug(
  tx: Tx,
  opts: { activityId: string; title: string },
): Promise<string> {
  const base = slugify(opts.title)
  const current = await tx.activity.findUnique({
    where: { id: opts.activityId },
    select: { slug: true },
  })

  if (current?.slug === base) {
    return base
  }

  let candidate = base
  let counter = 1

  while (true) {
    const [existingActivity, existingAlias] = await Promise.all([
      tx.activity.findFirst({
        where: {
          slug: candidate,
          id: { not: opts.activityId },
        },
        select: { id: true },
      }),
      tx.activitySlugAlias.findFirst({
        where: {
          slug: candidate,
          activityId: { not: opts.activityId },
        },
        select: { id: true },
      }),
    ])

    if (!existingActivity && !existingAlias) {
      break
    }
    counter++
    candidate = `${base}-${counter}`
  }

  if (current?.slug && current.slug !== candidate) {
    const existingOldAlias = await tx.activitySlugAlias.findUnique({
      where: { slug: current.slug },
    })
    if (!existingOldAlias) {
      await tx.activitySlugAlias.create({
        data: {
          id: randomUUID(),
          activityId: opts.activityId,
          slug: current.slug,
        },
      })
    } else if (existingOldAlias.activityId !== opts.activityId) {
      await tx.activitySlugAlias.update({
        where: { id: existingOldAlias.id },
        data: { activityId: opts.activityId },
      })
    }
  }

  await tx.activitySlugAlias.deleteMany({
    where: { slug: candidate, activityId: opts.activityId },
  })

  await tx.activity.update({
    where: { id: opts.activityId },
    data: { slug: candidate },
  })

  return candidate
}

export type SlugResolutionResult = {
  id: string
  kind: 'PROGRAM' | 'ACTIVITY'
  canonicalSlug: string | null
  creatorHandle: string | null
  isAlias: boolean
  canonicalUrl: string
}

export async function resolveSlug(
  viewerId: string | null,
  opts: { kind: 'PROGRAM' | 'ACTIVITY'; slugOrId: string; creatorHandle?: string | null },
): Promise<SlugResolutionResult> {
  const rawTarget = opts.slugOrId.trim()
  const isUuid = UUID_REGEX.test(rawTarget)

  if (opts.kind === 'PROGRAM') {
    let program: any = null
    let isAlias = false

    if (isUuid) {
      program = await db.program.findUnique({
        where: { id: rawTarget },
        include: programInclude,
      })
      if (!program) throw notFound('Program')
      if (program.slug) {
        isAlias = true
      }
    } else if (opts.creatorHandle) {
      const creator = await db.user.findFirst({
        where: { profile: { handle: opts.creatorHandle } },
        include: { profile: true },
      })
      if (!creator) throw notFound('Program')

      program = await db.program.findFirst({
        where: { creatorId: creator.id, slug: rawTarget },
        include: programInclude,
      })

      if (!program) {
        const alias = await db.programSlugAlias.findFirst({
          where: { creatorId: creator.id, slug: rawTarget },
        })
        if (alias) {
          program = await db.program.findUnique({
            where: { id: alias.programId },
            include: programInclude,
          })
          isAlias = true
        }
      }

      if (program && program.slug !== rawTarget) {
        isAlias = true
      }
    } else {
      // Direct /programs/:slug or platform program lookup
      program = await db.program.findFirst({
        where: { creatorId: null, slug: rawTarget },
        include: programInclude,
      })

      if (!program) {
        const alias = await db.programSlugAlias.findFirst({
          where: { creatorId: null, slug: rawTarget },
        })
        if (alias) {
          program = await db.program.findUnique({
            where: { id: alias.programId },
            include: programInclude,
          })
          isAlias = true
        }
      }

      if (!program) {
        // Fallback: search any published program by slug
        program = await db.program.findFirst({
          where: { slug: rawTarget, status: 'PUBLISHED', moderatedAt: null },
          include: programInclude,
        })
        if (!program) {
          const alias = await db.programSlugAlias.findFirst({
            where: { slug: rawTarget },
          })
          if (alias) {
            program = await db.program.findUnique({
              where: { id: alias.programId },
              include: programInclude,
            })
            isAlias = true
          }
        }
      }

      if (program && program.slug !== rawTarget) {
        isAlias = true
      }
    }

    if (!program) throw notFound('Program')

    // Access & publication check
    const isOwnerUser = isProgramOwner(program, viewerId)
    if (!isOwnerUser) {
      if (program.status !== 'PUBLISHED' || program.moderatedAt || !program.latestPublishedVersionId) {
        throw notFound('Program')
      }
      if (!(await canSeeProgram(viewerId, program))) {
        throw notFound('Program')
      }
    }

    const creatorHandle = program.creator?.profile?.handle ?? null
    const canonicalSlug = program.slug ?? null

    let canonicalUrl: string
    if (creatorHandle && canonicalSlug) {
      canonicalUrl = `/@${creatorHandle}/${canonicalSlug}`
      if (!opts.creatorHandle) {
        isAlias = true
      }
    } else if (canonicalSlug) {
      canonicalUrl = `/programs/${canonicalSlug}`
    } else {
      canonicalUrl = `/programs/${program.id}`
    }

    return {
      id: program.id,
      kind: 'PROGRAM',
      canonicalSlug,
      creatorHandle,
      isAlias,
      canonicalUrl,
    }
  }

  if (opts.kind === 'ACTIVITY') {
    let activity: any = null
    let isAlias = false

    if (isUuid) {
      activity = await db.activity.findUnique({
        where: { id: rawTarget },
        include: activityInclude,
      })
      if (!activity) throw notFound('Activity')
      if (activity.slug) {
        isAlias = true
      }
    } else {
      activity = await db.activity.findUnique({
        where: { slug: rawTarget },
        include: activityInclude,
      })

      if (!activity) {
        const alias = await db.activitySlugAlias.findUnique({
          where: { slug: rawTarget },
        })
        if (alias) {
          activity = await db.activity.findUnique({
            where: { id: alias.activityId },
            include: activityInclude,
          })
          isAlias = true
        }
      }

      if (activity && activity.slug !== rawTarget) {
        isAlias = true
      }
    }

    if (!activity) throw notFound('Activity')

    const owner = isOwner(activity, viewerId)
    if (!owner) {
      if (!isOpenlyReadable(activity)) throw notFound('Activity')
      if (viewerId && activity.creatorId && (await isBlockedEitherWay(viewerId, activity.creatorId))) {
        throw notFound('Activity')
      }
    }

    const canonicalSlug = activity.slug ?? null
    const creatorHandle = activity.creator?.profile?.handle ?? null
    const canonicalUrl = canonicalSlug ? `/activities/${canonicalSlug}` : `/activities/${activity.id}`

    return {
      id: activity.id,
      kind: 'ACTIVITY',
      canonicalSlug,
      creatorHandle,
      isAlias,
      canonicalUrl,
    }
  }

  throw notFound('Resource')
}

