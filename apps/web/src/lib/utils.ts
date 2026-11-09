import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the project's own utilities (tailwind.config.ts, 04-UI §4) so a ratio or
// width passed by a caller replaces the default instead of both classes racing on CSS order.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      aspect: [{ aspect: ['hero', 'preview', 'thumb', 'profile-cover'] }],
      'max-w': [{ 'max-w': ['focused', 'content', 'wide'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
