import {
  BookOpen,
  Compass,
  Dumbbell,
  Leaf,
  PiggyBank,
  Users,
  type LucideProps,
} from 'lucide-react'
import type { ActivityCategory } from '@/lib/activityCategory'

const ICONS = {
  fitness: Dumbbell,
  wellness: Leaf,
  education: BookOpen,
  finance: PiggyBank,
  relationships: Users,
  custom: Compass,
} satisfies Record<ActivityCategory, unknown>

/** The one category glyph used by tiles, heroes and badges. */
export function CategoryIcon({
  category,
  ...props
}: { category: ActivityCategory } & LucideProps) {
  const Icon = ICONS[category] ?? Compass
  return <Icon aria-hidden {...props} />
}
