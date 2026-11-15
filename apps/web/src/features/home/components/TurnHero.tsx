import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { Avatar } from '@/components/ui/Avatar'
import { resolveHero } from '@/lib/hero'
import type { AssistantCard } from '../engine/types'

/** The first image a card would show, for warming the next one while surfing. */
export function cardHeroSrc(card: AssistantCard | undefined): string | null {
  return card?.hero?.images.find((url): url is string => !!url) ?? null
}

/**
 * The Agent turn's identity image (03-UX §2a): the card's best available media, else its Domain's
 * category art, so every Program, Activity and Creator suggestion is visual. Tapping it previews.
 */
export function TurnHero({ card, onOpen }: { card: AssistantCard; onOpen: () => void }) {
  const categorySlugOf = useCategorySlugOf()
  if (!card.hero) return null
  const hero = resolveHero({
    title: card.title,
    images: card.hero.images,
    category: categorySlugOf(card.hero.categoryId),
  })
  const isCreator = card.kind === 'creator'
  return (
    <button
      key={card.id}
      type="button"
      onClick={onOpen}
      aria-label={`Preview ${card.title}`}
      className="relative block w-full overflow-hidden rounded-[var(--radius-panel)] border border-border/60 animate-in fade-in duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <EntityHero hero={hero} size="banner" interactive={false} className="aspect-[16/9] w-full rounded-none" />
      {isCreator && (
        <span className="absolute bottom-3 left-3 rounded-full ring-4 ring-surface">
          <Avatar src={card.hero.avatarUrl} name={card.title} size="lg" />
        </span>
      )}
    </button>
  )
}
