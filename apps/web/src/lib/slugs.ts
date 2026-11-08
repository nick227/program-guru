/**
 * Utilities for generating and resolving URL-friendly slugs for Programs and Activities.
 * Preserves stable URLs across title changes via aliases and client-side resolution.
 */

export function slugify(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove accent diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // remove leading/trailing hyphens
    .replace(/-+/g, '-') // collapse consecutive hyphens
}

export function isUuid(str: string | null | undefined): boolean {
  if (!str) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim())
}

export interface SlugMapping {
  id: string
  canonicalSlug: string
  aliases: string[]
  creatorHandle?: string | null
}

const STORAGE_KEY_PROGRAM_SLUGS = 'programs_app:slug_registry:programs'
const STORAGE_KEY_ACTIVITY_SLUGS = 'programs_app:slug_registry:activities'

class InMemorySlugRegistry {
  private programsById = new Map<string, SlugMapping>()
  private programsBySlug = new Map<string, { id: string; canonicalSlug: string; isAlias: boolean; creatorHandle?: string | null }>()
  private activitiesById = new Map<string, { id: string; canonicalSlug: string; aliases: string[] }>()
  private activitiesBySlug = new Map<string, { id: string; canonicalSlug: string; isAlias: boolean }>()

  constructor() {
    this.hydrateFromStorage()
  }

  private hydrateFromStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      const savedPrograms = localStorage.getItem(STORAGE_KEY_PROGRAM_SLUGS)
      if (savedPrograms) {
        const parsed: SlugMapping[] = JSON.parse(savedPrograms)
        for (const item of parsed) {
          this.registerProgram(item.id, item.canonicalSlug, item.creatorHandle, item.aliases)
        }
      }
      const savedActivities = localStorage.getItem(STORAGE_KEY_ACTIVITY_SLUGS)
      if (savedActivities) {
        const parsed: { id: string; canonicalSlug: string; aliases: string[] }[] = JSON.parse(savedActivities)
        for (const item of parsed) {
          this.registerActivity(item.id, item.canonicalSlug, item.aliases)
        }
      }
    } catch {
      // Storage unavailable or quota exceeded; memory store remains active
    }
  }

  private persist() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      const programs = Array.from(this.programsById.values())
      localStorage.setItem(STORAGE_KEY_PROGRAM_SLUGS, JSON.stringify(programs.slice(-200)))
      const activities = Array.from(this.activitiesById.values())
      localStorage.setItem(STORAGE_KEY_ACTIVITY_SLUGS, JSON.stringify(activities.slice(-200)))
    } catch {
      // Ignore storage write issues
    }
  }

  /**
   * Registers a Program. If the title/slug changed from an earlier registered slug,
   * the old slug is automatically preserved as an alias.
   */
  registerProgram(
    id: string,
    newSlug: string,
    creatorHandle?: string | null,
    existingAliases: string[] = [],
  ): { canonicalSlug: string; wasUpdated: boolean } {
    if (!id || !newSlug) return { canonicalSlug: newSlug, wasUpdated: false }
    const cleanSlug = slugify(newSlug)
    const existing = this.programsById.get(id)

    const aliases = new Set<string>(existingAliases.map(slugify).filter(Boolean))
    let wasUpdated = false

    if (existing) {
      existing.aliases.forEach((a) => aliases.add(a))
      if (existing.canonicalSlug !== cleanSlug) {
        aliases.add(existing.canonicalSlug)
        wasUpdated = true
      }
      if (creatorHandle && !existing.creatorHandle) {
        existing.creatorHandle = creatorHandle
      }
    }

    aliases.delete(cleanSlug)

    const record: SlugMapping = {
      id,
      canonicalSlug: cleanSlug,
      aliases: Array.from(aliases),
      creatorHandle: creatorHandle ?? existing?.creatorHandle ?? null,
    }

    this.programsById.set(id, record)
    this.programsBySlug.set(cleanSlug, {
      id,
      canonicalSlug: cleanSlug,
      isAlias: false,
      creatorHandle: record.creatorHandle,
    })

    // Index scoped key if creator handle exists
    if (record.creatorHandle) {
      this.programsBySlug.set(`${record.creatorHandle}/${cleanSlug}`, {
        id,
        canonicalSlug: cleanSlug,
        isAlias: false,
        creatorHandle: record.creatorHandle,
      })
    }

    for (const alias of record.aliases) {
      this.programsBySlug.set(alias, {
        id,
        canonicalSlug: cleanSlug,
        isAlias: true,
        creatorHandle: record.creatorHandle,
      })
      if (record.creatorHandle) {
        this.programsBySlug.set(`${record.creatorHandle}/${alias}`, {
          id,
          canonicalSlug: cleanSlug,
          isAlias: true,
          creatorHandle: record.creatorHandle,
        })
      }
    }

    this.persist()
    return { canonicalSlug: cleanSlug, wasUpdated }
  }

  resolveProgram(slugOrId: string, creatorHandle?: string | null) {
    if (!slugOrId) return null
    const clean = slugify(slugOrId)
    // Check scoped creator key first if provided
    if (creatorHandle) {
      const scopedMatch = this.programsBySlug.get(`${creatorHandle}/${clean}`)
      if (scopedMatch) return scopedMatch
    }
    const match = this.programsBySlug.get(clean)
    if (match) return match
    const byId = this.programsById.get(slugOrId)
    if (byId) {
      return {
        id: byId.id,
        canonicalSlug: byId.canonicalSlug,
        isAlias: false,
        creatorHandle: byId.creatorHandle,
      }
    }
    return null
  }

  registerActivity(id: string, newSlug: string, existingAliases: string[] = []) {
    if (!id || !newSlug) return { canonicalSlug: newSlug, wasUpdated: false }
    const cleanSlug = slugify(newSlug)
    const existing = this.activitiesById.get(id)

    const aliases = new Set<string>(existingAliases.map(slugify).filter(Boolean))
    let wasUpdated = false

    if (existing) {
      existing.aliases.forEach((a) => aliases.add(a))
      if (existing.canonicalSlug !== cleanSlug) {
        aliases.add(existing.canonicalSlug)
        wasUpdated = true
      }
    }
    aliases.delete(cleanSlug)

    const record = { id, canonicalSlug: cleanSlug, aliases: Array.from(aliases) }
    this.activitiesById.set(id, record)
    this.activitiesBySlug.set(cleanSlug, { id, canonicalSlug: cleanSlug, isAlias: false })
    for (const alias of record.aliases) {
      this.activitiesBySlug.set(alias, { id, canonicalSlug: cleanSlug, isAlias: true })
    }

    this.persist()
    return { canonicalSlug: cleanSlug, wasUpdated }
  }

  resolveActivity(slugOrId: string) {
    if (!slugOrId) return null
    const clean = slugify(slugOrId)
    const match = this.activitiesBySlug.get(clean)
    if (match) return match
    const byId = this.activitiesById.get(slugOrId)
    if (byId) {
      return { id: byId.id, canonicalSlug: byId.canonicalSlug, isAlias: false }
    }
    return null
  }
}

export const slugRegistry = new InMemorySlugRegistry()

