import { campfireTheme } from './CampfireTheme'
import { constellationTheme } from './ConstellationTheme'
import { sproutTheme } from './SproutTheme'
import type { StageThemeDefinition, StageThemeId } from './types'

export const STAGE_THEMES: StageThemeDefinition[] = [
  constellationTheme,
  campfireTheme,
  sproutTheme,
]

export function getStageTheme(id?: string | null): StageThemeDefinition {
  return (
    STAGE_THEMES.find((theme) => theme.id === (id as StageThemeId)) ??
    constellationTheme
  )
}

