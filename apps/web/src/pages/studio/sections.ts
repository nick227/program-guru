export const studioSections = [
  'library',
  'publishing',
  'channel',
  'audience',
  'dashboard',
  'organization',
] as const

export type StudioSection = (typeof studioSections)[number]

export function parseStudioSection(value: string | null): StudioSection {
  return studioSections.includes(value as StudioSection)
    ? (value as StudioSection)
    : 'library'
}
