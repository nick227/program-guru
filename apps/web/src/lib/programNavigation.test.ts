import { describe, it, expect } from 'vitest'
import { libraryProgramUrl, libraryReturnUrl, programPrimaryAction } from './programNavigation'
import type { PersonalProgram } from './programLibrary'
const entry = (status: string, current: unknown = null, owned = true) => ({ program: { id: 'id' }, status, current, owned } as PersonalProgram)
describe('Program navigation', () => {
  it('offers exactly one state-appropriate primary action', () => {
    expect(programPrimaryAction(entry('Not Started')).label).toBe('Start')
    expect(programPrimaryAction(entry('Active', { upcoming: [{ id: 'next' }] })).label).toBe('Continue')
    expect(programPrimaryAction(entry('Paused', { status: 'PAUSED' })).label).toBe('Resume')
    expect(programPrimaryAction(entry('Completed')).label).toBe('View')
    expect(programPrimaryAction(entry('Archived')).label).toBe('View')
  })
  it('does not offer a duplicate start for an already scheduled future run', () => {
    expect(programPrimaryAction(entry('Not Started', { status: 'ACTIVE' })).label).toBe('View')
  })
  it('hands scheduling to the existing editor or participation flow', () => {
    expect(programPrimaryAction(entry('Not Started')).href).toBe('/programs/id/workspace?step=publish')
    expect(programPrimaryAction(entry('Not Started', null, false)).href).toContain('/programs/id?start=1')
  })
  it('starts a published owned Program through enrollment without republishing', () => {
    const published = { ...entry('Not Started'), publicationStatus: 'PUBLISHED' }
    expect(programPrimaryAction(published).href).toContain('/programs/id?start=1')
  })
  it('routes My Programs entries to the standard Program page while preserving Library filters', () => {
    expect(libraryReturnUrl('?q=morning&status=Active&bq=other&program=id')).toBe('/library?q=morning&status=Active')
    expect(libraryProgramUrl('id', '?q=morning&status=Active&bq=other')).toBe(
      '/programs/id?returnTo=%2Flibrary%3Fq%3Dmorning%26status%3DActive',
    )
    const action = programPrimaryAction(entry('Active', { upcoming: [{ id: 'next' }] }), 'sort=name')
    expect(action.href).toContain(
      `returnTo=${encodeURIComponent('/programs/id?returnTo=%2Flibrary%3Fsort%3Dname')}`,
    )
  })
})
