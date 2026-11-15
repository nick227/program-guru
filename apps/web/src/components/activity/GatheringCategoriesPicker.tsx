import { X } from 'lucide-react'
import { useCategories, useFocuses } from '@project/sdk'
import { Select } from '@/components/ui/Select'

const MAX = 3

/**
 * Up to 3 additional curated Categories for a gathering (10 §9.12), so people with those interests can
 * find it. The Activity's own Categories are inherited and not offered again; the Activity is unchanged.
 */
export function GatheringCategoriesPicker({
  value,
  onChange,
  inherited,
}: {
  value: string[]
  onChange: (next: string[]) => void
  inherited: string[]
}) {
  const focuses = useFocuses({ enabled: true })
  const domains = useCategories()
  const labelOf = new Map((focuses.data ?? []).map((f) => [f.id, f.label]))
  const domainOf = new Map((domains.data ?? []).map((d) => [d.id, d.label]))
  const options = (focuses.data ?? []).filter((f) => !inherited.includes(f.id) && !value.includes(f.id))
  const byDomain = new Map<string, typeof options>()
  for (const f of options) byDomain.set(f.categoryId, [...(byDomain.get(f.categoryId) ?? []), f])

  return (
    <div className="activity-gatherings__field">
      <span className="label">Also related to (optional, up to {MAX})</span>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Related Categories">
          {value.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== id))}
                aria-label={`Remove ${labelOf.get(id) ?? 'Category'}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface-muted px-3 text-[13px] font-medium"
              >
                {labelOf.get(id) ?? 'Category'}
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < MAX && (
        <Select
          aria-label="Add a related Category"
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">Add a related Category…</option>
          {[...byDomain].map(([domainId, list]) => (
            <optgroup key={domainId} label={domainOf.get(domainId) ?? 'Other'}>
              {list.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      )}
    </div>
  )
}
